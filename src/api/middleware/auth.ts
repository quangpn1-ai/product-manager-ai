import type { Request, Response, NextFunction } from 'express';
import { authService } from '../../services/auth/auth-service.js';
import { organizationRepository } from '../../db/repositories/organization-repository.js';
import { userRepository } from '../../db/repositories/user-repository.js';
import { InvalidTokenError, ForbiddenError, NotFoundError } from '../../utils/errors.js';
import type { OrgRole, RequestContext } from '../../types/index.js';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      context?: RequestContext;
    }
  }
}

/**
 * Middleware to authenticate requests using JWT
 */
export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new InvalidTokenError();
    }

    const token = authHeader.slice(7);
    const { userId } = await authService.verifyAccessToken(token);

    // Verify user exists and is active
    const user = await userRepository.findById(userId);
    if (!user || user.status !== 'active') {
      throw new InvalidTokenError();
    }

    req.context = {
      userId,
      ipAddress: req.ip ?? 'unknown',
      userAgent: req.get('user-agent') ?? 'unknown',
    };

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Middleware to require membership in an organization
 * Must be used after authenticate middleware
 */
export function requireOrgMembership(requiredRoles?: OrgRole[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.context?.userId) {
        throw new InvalidTokenError();
      }

      const orgId = req.params['org_id'];
      if (!orgId) {
        throw new NotFoundError('Organization');
      }

      // Check if org exists
      const org = await organizationRepository.findById(orgId);
      if (!org || org.status !== 'active') {
        throw new NotFoundError('Organization');
      }

      // Check membership
      const membership = await organizationRepository.findMembership(orgId, req.context.userId);
      if (!membership || membership.status !== 'active') {
        throw new ForbiddenError('You are not a member of this organization');
      }

      // Check role if required
      if (requiredRoles && requiredRoles.length > 0) {
        if (!requiredRoles.includes(membership.role)) {
          throw new ForbiddenError('Insufficient permissions');
        }
      }

      // Add org context
      req.context.orgId = orgId;
      req.context.role = membership.role;

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Middleware to require org admin role
 */
export const requireOrgAdmin = requireOrgMembership(['org_admin']);

/**
 * Optional authentication - doesn't fail if no token provided
 */
export async function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      req.context = {
        userId: '',
        ipAddress: req.ip ?? 'unknown',
        userAgent: req.get('user-agent') ?? 'unknown',
      };
      return next();
    }

    const token = authHeader.slice(7);
    try {
      const { userId } = await authService.verifyAccessToken(token);
      req.context = {
        userId,
        ipAddress: req.ip ?? 'unknown',
        userAgent: req.get('user-agent') ?? 'unknown',
      };
    } catch {
      req.context = {
        userId: '',
        ipAddress: req.ip ?? 'unknown',
        userAgent: req.get('user-agent') ?? 'unknown',
      };
    }

    next();
  } catch (error) {
    next(error);
  }
}
