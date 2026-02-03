// ============================================
// Application Error Classes
// ============================================

export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;
  public readonly isOperational: boolean;

  constructor(
    code: string,
    message: string,
    statusCode: number = 500,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
    this.name = 'AppError';

    Error.captureStackTrace(this, this.constructor);
  }
}

// -------------------- Auth Errors --------------------
export class AuthError extends AppError {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(code, message, 401, details);
    this.name = 'AuthError';
  }
}

export class InvalidCredentialsError extends AuthError {
  constructor() {
    super('AUTH_INVALID_CREDENTIALS', 'Invalid email or password');
  }
}

export class EmailNotVerifiedError extends AppError {
  constructor() {
    super('AUTH_EMAIL_NOT_VERIFIED', 'Email not verified', 403);
    this.name = 'EmailNotVerifiedError';
  }
}

export class TokenExpiredError extends AuthError {
  constructor() {
    super('AUTH_TOKEN_EXPIRED', 'Token has expired');
  }
}

export class InvalidTokenError extends AuthError {
  constructor() {
    super('AUTH_INVALID_TOKEN', 'Invalid token');
  }
}

// -------------------- Authorization Errors --------------------
export class ForbiddenError extends AppError {
  constructor(message: string = 'Access denied', details?: Record<string, unknown>) {
    super('ORG_FORBIDDEN', message, 403, details);
    this.name = 'ForbiddenError';
  }
}

export class DomainNotAllowedError extends AppError {
  constructor(domain: string) {
    super('ORG_DOMAIN_NOT_ALLOWED', `Email domain '${domain}' is not allowed for this organization`, 403);
    this.name = 'DomainNotAllowedError';
  }
}

// -------------------- Validation Errors --------------------
export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('VALIDATION_ERROR', message, 422, details);
    this.name = 'ValidationError';
  }
}

// -------------------- Resource Errors --------------------
export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super(
      'RESOURCE_NOT_FOUND',
      id ? `${resource} not found: ${id}` : `${resource} not found`,
      404
    );
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('CONFLICT', message, 409, details);
    this.name = 'ConflictError';
  }
}

// -------------------- Provider Errors --------------------
export class ProviderNotConfiguredError extends AppError {
  constructor(provider: string) {
    super('PROVIDER_NOT_CONFIGURED', `AI provider '${provider}' is not configured`, 400);
    this.name = 'ProviderNotConfiguredError';
  }
}

export class ProviderError extends AppError {
  constructor(provider: string, message: string, details?: Record<string, unknown>) {
    super('PROVIDER_ERROR', `${provider}: ${message}`, 502, details);
    this.name = 'ProviderError';
  }
}

// -------------------- Budget Errors --------------------
export class BudgetExceededError extends AppError {
  constructor(message: string = 'Budget limit exceeded') {
    super('BUDGET_HARD_LIMIT_EXCEEDED', message, 402);
    this.name = 'BudgetExceededError';
  }
}

// -------------------- Rate Limit Errors --------------------
export class RateLimitError extends AppError {
  constructor(retryAfter?: number) {
    super('RATE_LIMITED', 'Too many requests', 429, retryAfter ? { retryAfter } : undefined);
    this.name = 'RateLimitError';
  }
}

// -------------------- Run Errors --------------------
export class RunInProgressError extends AppError {
  constructor(taskId: string) {
    super('RUN_IN_PROGRESS', `A run is already in progress for task: ${taskId}`, 409);
    this.name = 'RunInProgressError';
  }
}

export class InvalidStateTransitionError extends AppError {
  constructor(currentStatus: string, targetStatus: string) {
    super(
      'INVALID_STATE_TRANSITION',
      `Cannot transition from '${currentStatus}' to '${targetStatus}'`,
      422
    );
    this.name = 'InvalidStateTransitionError';
  }
}

// -------------------- Utility Functions --------------------
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function toAppError(error: unknown): AppError {
  if (isAppError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return new AppError('INTERNAL_ERROR', error.message);
  }

  return new AppError('INTERNAL_ERROR', 'An unexpected error occurred');
}
