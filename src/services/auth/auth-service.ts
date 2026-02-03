import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { config } from '../../config/index.js';
import { userRepository } from '../../db/repositories/user-repository.js';
import { sessionRepository } from '../../db/repositories/session-repository.js';
import { organizationRepository } from '../../db/repositories/organization-repository.js';
import { query, toCamelCase } from '../../db/index.js';
import {
  InvalidCredentialsError,
  EmailNotVerifiedError,
  TokenExpiredError,
  InvalidTokenError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../utils/errors.js';
import { hashSHA256, generateSecureToken } from '../../utils/encryption.js';
import type { User, UserPublic, AuthTokens, Organization, OrgMembership } from '../../types/index.js';
import { logger } from '../../utils/logger.js';

const BCRYPT_ROUNDS = 12;

interface SignupInput {
  email: string;
  password: string;
  org?: {
    name: string;
    slug: string;
    timezone?: string;
  };
}

interface SignupResult {
  user: UserPublic;
  org?: Organization;
  verificationToken: string;
}

interface LoginResult {
  user: UserPublic;
  tokens: AuthTokens;
  memberships: OrgMembership[];
}

interface JWTPayload {
  sub: string;
  type: 'access' | 'refresh';
  iat: number;
  exp: number;
}

function parseExpiry(expiry: string): number {
  const match = expiry.match(/^(\d+)([smhd])$/);
  if (!match) {
    throw new Error(`Invalid expiry format: ${expiry}`);
  }
  const value = parseInt(match[1]!, 10);
  const unit = match[2];
  const multipliers: Record<string, number> = {
    s: 1,
    m: 60,
    h: 3600,
    d: 86400,
  };
  return value * (multipliers[unit!] ?? 1);
}

export class AuthService {
  async signup(input: SignupInput, ipAddress?: string, userAgent?: string): Promise<SignupResult> {
    // Check if user already exists
    if (await userRepository.existsByEmail(input.email)) {
      throw new ConflictError('An account with this email already exists');
    }

    // Validate org slug if provided
    if (input.org) {
      if (await organizationRepository.existsBySlug(input.org.slug)) {
        throw new ConflictError('Organization slug is already taken');
      }
    }

    // Hash password
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

    // Create user
    const user = await userRepository.create({
      email: input.email,
      passwordHash,
    });

    // Create verification token
    const verificationToken = generateSecureToken();
    const verificationExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await query(
      `INSERT INTO email_verification_tokens (user_id, token, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, hashSHA256(verificationToken), verificationExpiry]
    );

    // Create org if requested
    let org: Organization | undefined;
    if (input.org) {
      const result = await organizationRepository.createWithAdmin(
        {
          name: input.org.name,
          slug: input.org.slug,
          timezone: input.org.timezone,
        },
        user.id
      );
      org = result.org;
    }

    logger.info({ userId: user.id, orgId: org?.id }, 'User signed up');

    return {
      user: userRepository.toPublic(user),
      org,
      verificationToken,
    };
  }

  async login(
    email: string,
    password: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<LoginResult> {
    const user = await userRepository.findByEmail(email);

    if (!user || !user.passwordHash) {
      throw new InvalidCredentialsError();
    }

    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      throw new InvalidCredentialsError();
    }

    if (!user.emailVerified) {
      throw new EmailNotVerifiedError();
    }

    if (user.status !== 'active') {
      throw new InvalidCredentialsError();
    }

    // Update last login
    await userRepository.update(user.id, { lastLoginAt: new Date() });

    // Generate tokens
    const tokens = await this.generateTokens(user.id, ipAddress, userAgent);

    // Get user memberships
    const memberships = await organizationRepository.findMembershipsByUser(user.id);

    logger.info({ userId: user.id }, 'User logged in');

    return {
      user: userRepository.toPublic(user),
      tokens,
      memberships,
    };
  }

  async refreshTokens(
    refreshToken: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<AuthTokens> {
    // Verify the refresh token JWT
    let payload: JWTPayload;
    try {
      payload = jwt.verify(refreshToken, config.jwt.secret) as JWTPayload;
    } catch {
      throw new InvalidTokenError();
    }

    if (payload.type !== 'refresh') {
      throw new InvalidTokenError();
    }

    // Find the session by token hash
    const tokenHash = hashSHA256(refreshToken);
    const session = await sessionRepository.findByTokenHash(tokenHash);

    if (!session) {
      throw new InvalidTokenError();
    }

    // Revoke the old session (token rotation)
    await sessionRepository.revoke(session.id);

    // Generate new tokens
    return this.generateTokens(payload.sub, ipAddress, userAgent);
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = hashSHA256(refreshToken);
    await sessionRepository.revokeByTokenHash(tokenHash);
  }

  async logoutAll(userId: string): Promise<void> {
    await sessionRepository.revokeAllForUser(userId);
  }

  async verifyEmail(token: string): Promise<UserPublic> {
    const tokenHash = hashSHA256(token);

    const result = await query<Record<string, unknown>>(
      `SELECT * FROM email_verification_tokens
       WHERE token = $1 AND used_at IS NULL AND expires_at > now()`,
      [tokenHash]
    );

    if (result.rows.length === 0) {
      throw new InvalidTokenError();
    }

    const tokenRecord = toCamelCase<{ userId: string; id: string }>(result.rows[0]!);

    // Mark token as used
    await query(
      'UPDATE email_verification_tokens SET used_at = now() WHERE id = $1',
      [tokenRecord.id]
    );

    // Verify user email
    const user = await userRepository.update(tokenRecord.userId, { emailVerified: true });
    if (!user) {
      throw new NotFoundError('User');
    }

    logger.info({ userId: user.id }, 'Email verified');

    return userRepository.toPublic(user);
  }

  async forgotPassword(email: string): Promise<string | null> {
    const user = await userRepository.findByEmail(email);

    if (!user) {
      // Don't reveal if user exists
      return null;
    }

    // Generate reset token
    const resetToken = generateSecureToken();
    const tokenHash = hashSHA256(resetToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await query(
      `INSERT INTO password_reset_tokens (user_id, token, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, tokenHash, expiresAt]
    );

    logger.info({ userId: user.id }, 'Password reset requested');

    return resetToken;
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const tokenHash = hashSHA256(token);

    const result = await query<Record<string, unknown>>(
      `SELECT * FROM password_reset_tokens
       WHERE token = $1 AND used_at IS NULL AND expires_at > now()`,
      [tokenHash]
    );

    if (result.rows.length === 0) {
      throw new InvalidTokenError();
    }

    const tokenRecord = toCamelCase<{ userId: string; id: string }>(result.rows[0]!);

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

    // Update user password
    await userRepository.update(tokenRecord.userId, { passwordHash });

    // Mark token as used
    await query(
      'UPDATE password_reset_tokens SET used_at = now() WHERE id = $1',
      [tokenRecord.id]
    );

    // Revoke all sessions
    await sessionRepository.revokeAllForUser(tokenRecord.userId);

    logger.info({ userId: tokenRecord.userId }, 'Password reset completed');
  }

  async verifyAccessToken(token: string): Promise<{ userId: string }> {
    try {
      const payload = jwt.verify(token, config.jwt.secret) as JWTPayload;

      if (payload.type !== 'access') {
        throw new InvalidTokenError();
      }

      return { userId: payload.sub };
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new TokenExpiredError();
      }
      throw new InvalidTokenError();
    }
  }

  private async generateTokens(
    userId: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<AuthTokens> {
    const accessExpiresIn = parseExpiry(config.jwt.accessExpiresIn);
    const refreshExpiresIn = parseExpiry(config.jwt.refreshExpiresIn);

    const accessToken = jwt.sign(
      { sub: userId, type: 'access' },
      config.jwt.secret,
      { expiresIn: accessExpiresIn }
    );

    const refreshToken = jwt.sign(
      { sub: userId, type: 'refresh' },
      config.jwt.secret,
      { expiresIn: refreshExpiresIn }
    );

    // Store refresh token hash in session
    const refreshTokenHash = hashSHA256(refreshToken);
    const expiresAt = new Date(Date.now() + refreshExpiresIn * 1000);

    await sessionRepository.create({
      userId,
      refreshTokenHash,
      ipAddress,
      userAgent,
      expiresAt,
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: accessExpiresIn,
    };
  }
}

export const authService = new AuthService();
