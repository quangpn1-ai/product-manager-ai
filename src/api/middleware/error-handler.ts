import type { Request, Response, NextFunction } from 'express';
import { AppError, isAppError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { config } from '../../config/index.js';

interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Log the error
  if (isAppError(err) && err.isOperational) {
    logger.warn({
      err: { code: err.code, message: err.message, statusCode: err.statusCode },
      path: req.path,
      method: req.method,
    }, 'Operational error');
  } else {
    logger.error({
      err,
      path: req.path,
      method: req.method,
      stack: err.stack,
    }, 'Unexpected error');
  }

  // Build error response
  let statusCode = 500;
  let errorResponse: ErrorResponse;

  if (isAppError(err)) {
    statusCode = err.statusCode;
    errorResponse = {
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    };
  } else {
    // Don't expose internal error details in production
    errorResponse = {
      error: {
        code: 'INTERNAL_ERROR',
        message: config.env === 'production'
          ? 'An unexpected error occurred'
          : err.message,
      },
    };

    if (config.env !== 'production') {
      errorResponse.error.details = { stack: err.stack };
    }
  }

  res.status(statusCode).json(errorResponse);
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Route not found: ${req.method} ${req.path}`,
    },
  });
}
