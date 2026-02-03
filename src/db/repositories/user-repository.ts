import { query, toCamelCase } from '../index.js';
import type { User, UserPublic } from '../../types/index.js';

interface CreateUserInput {
  email: string;
  passwordHash?: string;
}

interface UpdateUserInput {
  passwordHash?: string;
  emailVerified?: boolean;
  status?: string;
  lastLoginAt?: Date;
}

export class UserRepository {
  async findById(id: string): Promise<User | null> {
    const result = await query<Record<string, unknown>>(
      'SELECT * FROM users WHERE id = $1',
      [id]
    );
    return result.rows[0] ? toCamelCase<User>(result.rows[0]) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const result = await query<Record<string, unknown>>(
      'SELECT * FROM users WHERE email = $1',
      [email.toLowerCase()]
    );
    return result.rows[0] ? toCamelCase<User>(result.rows[0]) : null;
  }

  async create(input: CreateUserInput): Promise<User> {
    const result = await query<Record<string, unknown>>(
      `INSERT INTO users (email, password_hash, email_verified, status)
       VALUES ($1, $2, FALSE, 'active')
       RETURNING *`,
      [input.email.toLowerCase(), input.passwordHash ?? null]
    );
    return toCamelCase<User>(result.rows[0]!);
  }

  async update(id: string, input: UpdateUserInput): Promise<User | null> {
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (input.passwordHash !== undefined) {
      updates.push(`password_hash = $${paramIndex++}`);
      values.push(input.passwordHash);
    }
    if (input.emailVerified !== undefined) {
      updates.push(`email_verified = $${paramIndex++}`);
      values.push(input.emailVerified);
    }
    if (input.status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(input.status);
    }
    if (input.lastLoginAt !== undefined) {
      updates.push(`last_login_at = $${paramIndex++}`);
      values.push(input.lastLoginAt);
    }

    if (updates.length === 0) {
      return this.findById(id);
    }

    values.push(id);
    const result = await query<Record<string, unknown>>(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );
    return result.rows[0] ? toCamelCase<User>(result.rows[0]) : null;
  }

  async existsByEmail(email: string): Promise<boolean> {
    const result = await query<{ exists: boolean }>(
      'SELECT EXISTS(SELECT 1 FROM users WHERE email = $1) as exists',
      [email.toLowerCase()]
    );
    return result.rows[0]?.exists ?? false;
  }

  toPublic(user: User): UserPublic {
    return {
      id: user.id,
      email: user.email,
      emailVerified: user.emailVerified,
      status: user.status,
      createdAt: user.createdAt,
    };
  }
}

export const userRepository = new UserRepository();
