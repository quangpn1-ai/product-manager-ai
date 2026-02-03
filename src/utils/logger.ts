import pino from 'pino';
import { config } from '../config/index.js';

export const logger = pino({
  level: config.logLevel,
  transport:
    config.env === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
  base: {
    env: config.env,
  },
  redact: {
    paths: ['req.headers.authorization', 'password', 'passwordHash', 'apiKey', 'refreshToken'],
    remove: true,
  },
});

export type Logger = typeof logger;
