import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';

import { config } from './config/index.js';
import { logger } from './utils/logger.js';
import { healthCheck, closePool } from './db/index.js';
import { errorHandler, notFoundHandler } from './api/middleware/error-handler.js';

// Routes
import authRoutes from './api/routes/auth.js';
import orgsRoutes from './api/routes/orgs.js';
import providerRoutes, { budgetRouter } from './api/routes/providers.js';
import tasksRoutes from './api/routes/tasks.js';
import decisionsRoutes from './api/routes/decisions.js';
import auditRoutes from './api/routes/audit.js';
import { authenticate, requireOrgMembership } from './api/middleware/auth.js';

const app = express();

// Trust proxy for rate limiting and IP detection
app.set('trust proxy', 1);

// Security middleware
app.use(helmet());
app.use(cors({
  origin: config.env === 'production'
    ? config.baseUrl
    : ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173'],
  credentials: true,
}));

// Request logging
app.use(pinoHttp({
  logger,
  autoLogging: {
    ignore: (req) => req.url === '/health',
  },
}));

// Body parsing
app.use(express.json({ limit: '1mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many requests, please try again later',
    },
  },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: config.rateLimit.authMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many authentication attempts, please try again later',
    },
  },
});

// Health check
app.get('/health', async (_req, res) => {
  const dbHealthy = await healthCheck();
  if (dbHealthy) {
    res.json({ status: 'ok', database: 'connected' });
  } else {
    res.status(503).json({ status: 'unhealthy', database: 'disconnected' });
  }
});

// API v1 routes
const v1Router = express.Router();

// Auth routes (with stricter rate limiting)
v1Router.use('/auth', authLimiter, authRoutes);

// Organization routes
v1Router.use('/orgs', limiter, orgsRoutes);

// Provider and budget routes (nested under orgs)
v1Router.use('/orgs/:org_id/ai/providers', authenticate, requireOrgMembership(), providerRoutes);
v1Router.use('/orgs/:org_id/budgets', authenticate, requireOrgMembership(), budgetRouter);

// Task routes (nested under orgs)
v1Router.use('/orgs/:org_id/tasks', tasksRoutes);

// Decision routes (nested under orgs)
v1Router.use('/orgs/:org_id/decisions', decisionsRoutes);

// Audit routes (nested under orgs - admin only)
v1Router.use('/orgs/:org_id/audit', auditRoutes);

// Run routes (get run by ID)
v1Router.get('/orgs/:org_id/runs/:run_id', authenticate, requireOrgMembership(), async (req, res, next) => {
  try {
    const { runRepository } = await import('./db/repositories/task-repository.js');
    const orgId = req.context!.orgId!;
    const runId = req.params['run_id']!;

    const run = await runRepository.findById(orgId, runId);
    if (!run) {
      res.status(404).json({
        error: { code: 'RESOURCE_NOT_FOUND', message: 'Run not found' },
      });
      return;
    }

    const stages = await runRepository.findStagesByRunId(orgId, runId);

    res.json({
      data: {
        id: run.id,
        task_id: run.taskId,
        workflow_id: run.workflowId,
        status: run.status,
        idempotency_key: run.idempotencyKey,
        started_at: run.startedAt,
        finished_at: run.finishedAt,
        error_json: run.errorJson,
        created_at: run.createdAt,
        stages: stages.map((stage) => ({
          stage_id: stage.stageId,
          role: stage.role,
          provider: stage.provider,
          model: stage.model,
          status: stage.status,
          input_tokens: stage.inputTokens,
          output_tokens: stage.outputTokens,
          cost_cents: stage.costCents,
          started_at: stage.startedAt,
          finished_at: stage.finishedAt,
          output_json: stage.outputJson,
          error_json: stage.errorJson,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
});

// Cancel run
v1Router.post('/orgs/:org_id/runs/:run_id/cancel', authenticate, requireOrgMembership(), async (req, res, next) => {
  try {
    const { runRepository } = await import('./db/repositories/task-repository.js');
    const orgId = req.context!.orgId!;
    const runId = req.params['run_id']!;

    const run = await runRepository.findById(orgId, runId);
    if (!run) {
      res.status(404).json({
        error: { code: 'RESOURCE_NOT_FOUND', message: 'Run not found' },
      });
      return;
    }

    if (!['QUEUED', 'RUNNING'].includes(run.status)) {
      res.status(409).json({
        error: { code: 'CONFLICT', message: 'Run cannot be cancelled in current state' },
      });
      return;
    }

    await runRepository.updateStatus(orgId, runId, 'CANCELLED');

    logger.info({ runId, orgId, actorId: req.context!.userId }, 'Run cancelled');

    res.json({
      data: null,
      meta: { message: 'Run cancelled' },
    });
  } catch (error) {
    next(error);
  }
});

app.use('/v1', v1Router);

// 404 handler
app.use(notFoundHandler);

// Error handler
app.use(errorHandler);

// Start server
const server = app.listen(config.port, () => {
  logger.info({ port: config.port, env: config.env }, 'Server started');
});

// Graceful shutdown
const shutdown = async (signal: string) => {
  logger.info({ signal }, 'Shutdown signal received');

  server.close(async () => {
    logger.info('HTTP server closed');
    await closePool();
    process.exit(0);
  });

  // Force shutdown after timeout
  setTimeout(() => {
    logger.error('Forced shutdown due to timeout');
    process.exit(1);
  }, 30000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default app;
