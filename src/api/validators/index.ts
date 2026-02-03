import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';
import { ValidationError } from '../../utils/errors.js';

/**
 * Creates a middleware that validates request body against a Zod schema
 */
export function validateBody<T extends z.ZodSchema>(schema: T) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.flatten();
      throw new ValidationError('Invalid request body', {
        fieldErrors: errors.fieldErrors,
        formErrors: errors.formErrors,
      });
    }
    req.body = result.data;
    next();
  };
}

/**
 * Creates a middleware that validates request query against a Zod schema
 */
export function validateQuery<T extends z.ZodSchema>(schema: T) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const errors = result.error.flatten();
      throw new ValidationError('Invalid query parameters', {
        fieldErrors: errors.fieldErrors,
      });
    }
    req.query = result.data;
    next();
  };
}

/**
 * Creates a middleware that validates request params against a Zod schema
 */
export function validateParams<T extends z.ZodSchema>(schema: T) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      const errors = result.error.flatten();
      throw new ValidationError('Invalid path parameters', {
        fieldErrors: errors.fieldErrors,
      });
    }
    req.params = result.data;
    next();
  };
}

// Common schemas
export const uuidSchema = z.string().uuid();

export const paginationSchema = z.object({
  limit: z.string().transform(Number).pipe(z.number().min(1).max(100)).default('20'),
  offset: z.string().transform(Number).pipe(z.number().min(0)).default('0'),
});

export const emailSchema = z.string().email().toLowerCase();

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters');

export const slugSchema = z
  .string()
  .min(2)
  .max(63)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase alphanumeric with hyphens');
