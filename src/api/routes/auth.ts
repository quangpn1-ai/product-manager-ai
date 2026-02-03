import { Router } from 'express';
import { z } from 'zod';
import { authService } from '../../services/auth/auth-service.js';
import { authenticate } from '../middleware/auth.js';
import { validateBody, emailSchema, passwordSchema, slugSchema } from '../validators/index.js';

const router = Router();

// Validation schemas
const signupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  org: z
    .object({
      name: z.string().min(1).max(255),
      slug: slugSchema,
      timezone: z.string().optional(),
    })
    .optional(),
});

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refresh_token: z.string().min(1),
});

const verifyEmailSchema = z.object({
  token: z.string().min(1),
});

const forgotPasswordSchema = z.object({
  email: emailSchema,
});

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  new_password: passwordSchema,
});

// POST /auth/signup
router.post('/signup', validateBody(signupSchema), async (req, res, next) => {
  try {
    const result = await authService.signup(req.body, req.ip, req.get('user-agent'));

    res.status(201).json({
      data: {
        user: result.user,
        org: result.org,
        // In production, don't return the token - send via email instead
        verification_token: result.verificationToken,
      },
      meta: {
        message: 'Account created. Please verify your email.',
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /auth/login
router.post('/login', validateBody(loginSchema), async (req, res, next) => {
  try {
    const result = await authService.login(
      req.body.email,
      req.body.password,
      req.ip,
      req.get('user-agent')
    );

    res.json({
      data: {
        user: result.user,
        tokens: {
          access_token: result.tokens.accessToken,
          refresh_token: result.tokens.refreshToken,
          expires_in: result.tokens.expiresIn,
          token_type: 'Bearer',
        },
        memberships: result.memberships.map((m) => ({
          org_id: m.orgId,
          role: m.role,
          status: m.status,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /auth/refresh
router.post('/refresh', validateBody(refreshSchema), async (req, res, next) => {
  try {
    const tokens = await authService.refreshTokens(
      req.body.refresh_token,
      req.ip,
      req.get('user-agent')
    );

    res.json({
      data: {
        tokens: {
          access_token: tokens.accessToken,
          refresh_token: tokens.refreshToken,
          expires_in: tokens.expiresIn,
          token_type: 'Bearer',
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /auth/logout
router.post('/logout', validateBody(refreshSchema), async (req, res, next) => {
  try {
    await authService.logout(req.body.refresh_token);

    res.json({
      data: null,
      meta: {
        message: 'Logged out successfully',
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /auth/verify-email
router.post('/verify-email', validateBody(verifyEmailSchema), async (req, res, next) => {
  try {
    const user = await authService.verifyEmail(req.body.token);

    res.json({
      data: {
        user,
      },
      meta: {
        message: 'Email verified successfully',
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /auth/forgot-password
router.post('/forgot-password', validateBody(forgotPasswordSchema), async (req, res, next) => {
  try {
    const token = await authService.forgotPassword(req.body.email);

    // Always return success to prevent email enumeration
    res.json({
      data: {
        // In production, don't return the token - send via email instead
        reset_token: token,
      },
      meta: {
        message: 'If the email exists, a password reset link has been sent.',
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /auth/reset-password
router.post('/reset-password', validateBody(resetPasswordSchema), async (req, res, next) => {
  try {
    await authService.resetPassword(req.body.token, req.body.new_password);

    res.json({
      data: null,
      meta: {
        message: 'Password reset successfully. Please log in with your new password.',
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /auth/me - Get current user info
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const { userRepository } = await import('../../db/repositories/user-repository.js');
    const { organizationRepository } = await import('../../db/repositories/organization-repository.js');

    const user = await userRepository.findById(req.context!.userId);
    if (!user) {
      throw new Error('User not found');
    }

    const memberships = await organizationRepository.findMembershipsByUser(user.id);

    res.json({
      data: {
        user: userRepository.toPublic(user),
        memberships: memberships.map((m) => ({
          org_id: m.orgId,
          role: m.role,
          status: m.status,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
