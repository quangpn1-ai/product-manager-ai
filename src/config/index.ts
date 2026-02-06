import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).default('3000'),
  BASE_URL: z.string().url().default('http://localhost:3000'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),

  JWT_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),

  APP_KMS_MASTER_KEY: z.string().min(64),

  MANAGED_OPENAI_KEY: z.string().optional(),
  MANAGED_ANTHROPIC_KEY: z.string().optional(),
  MANAGED_GOOGLE_KEY: z.string().optional(),

  RATE_LIMIT_WINDOW_MS: z.string().transform(Number).default('60000'),
  RATE_LIMIT_MAX_REQUESTS: z.string().transform(Number).default('100'),
  AUTH_RATE_LIMIT_MAX: z.string().transform(Number).default('1000'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = {
  env: parsed.data.NODE_ENV,
  port: parsed.data.PORT,
  baseUrl: parsed.data.BASE_URL,
  logLevel: parsed.data.LOG_LEVEL,

  database: {
    url: parsed.data.DATABASE_URL,
  },

  redis: {
    url: parsed.data.REDIS_URL,
  },

  jwt: {
    secret: parsed.data.JWT_SECRET,
    accessExpiresIn: parsed.data.JWT_ACCESS_EXPIRES_IN,
    refreshExpiresIn: parsed.data.JWT_REFRESH_EXPIRES_IN,
  },

  encryption: {
    masterKey: parsed.data.APP_KMS_MASTER_KEY,
  },

  managedProviders: {
    openai: parsed.data.MANAGED_OPENAI_KEY,
    anthropic: parsed.data.MANAGED_ANTHROPIC_KEY,
    google: parsed.data.MANAGED_GOOGLE_KEY,
  },

  rateLimit: {
    windowMs: parsed.data.RATE_LIMIT_WINDOW_MS,
    maxRequests: parsed.data.RATE_LIMIT_MAX_REQUESTS,
    authMax: parsed.data.AUTH_RATE_LIMIT_MAX,
  },
} as const;

export type Config = typeof config;
