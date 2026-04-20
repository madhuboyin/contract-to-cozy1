// apps/backend/src/index.ts
// Sentry MUST be initialized before any other import so its OpenTelemetry
// instrumentation can wrap Express, Prisma, and HTTP clients correctly.
import * as Sentry from '@sentry/node';
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV ?? 'development',
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  // Never log Sentry's own debug output to production logs
  debug: false,
  // beforeSend: strip any accidental PII from error events
  beforeSend(event) {
    if (event.request?.cookies) delete event.request.cookies;
    if (event.request?.headers?.['authorization']) {
      event.request.headers['authorization'] = '[Filtered]';
    }
    return event;
  },
});

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import swaggerUi from 'swagger-ui-express';
import basicAuth from 'express-basic-auth';
import { prisma } from './lib/prisma';
import { redis } from './lib/redis';
import { runDeepHealthChecks } from './lib/deepHealth';

// Import swagger config
import { swaggerSpec } from './config/swagger.config';

// Import routes
import authRoutes from './routes/auth.routes';
import providerRoutes from './routes/provider.routes';
import bookingRoutes from './routes/booking.routes';
import homeReportExportRoutes from './routes/homeReportExport.routes';
import propertyRoutes from './routes/property.routes';
import userRoutes from './routes/user.routes';
import checklistRoutes from './routes/checklist.routes';
import serviceCategoryRoutes from './routes/service-category.routes';
import maintenanceRoutes from './routes/maintenance.routes';
import homeownerManagementRoutes from './routes/home-management.routes';
import riskRoutes from './routes/risk.routes';
import financialRoutes from './routes/financialEfficiency.routes';
import geminiRoutes from './routes/gemini.routes';
import emergencyRoutes from './routes/emergency.routes';
import documentRoutes from './routes/document.routes';
import oracleRoutes from './routes/applianceOracle.routes';
import budgetRoutes from './routes/budgetForecaster.routes';
import climateRoutes from './routes/climateRisk.routes';
import modificationRoutes from './routes/homeModification.routes';
import appreciationRoutes from './routes/propertyAppreciation.routes';
import energyRoutes from './routes/energyAuditor.routes';
import visualInspectorRoutes from './routes/visualInspector.routes';
import taxAppealRoutes from './routes/taxAppeal.routes';
import movingConciergeRoutes from './routes/movingConcierge.routes';
import { communityRoutes } from './community/community.routes';
import sellerPrepRoutes from './sellerPrep/sellerPrep.routes';
import inspectionReportRoutes from './routes/inspectionReport.routes';
import localUpdatesRoutes from './localUpdates/localUpdates.routes';
import orchestrationRoutes from './routes/orchestration.routes';

// Import middleware
import { errorHandler } from './middleware/error.middleware';
import { authenticate, requireMfa, requireRole } from './middleware/auth.middleware';
import { apiRateLimiter } from './middleware/rateLimiter.middleware';
import { csrfProtection, getCsrfToken } from './middleware/csrf.middleware';
import cspReportRoutes from './routes/cspReport.routes';
import { UserRole } from './types/auth.types';
import notificationRoutes from './routes/notification.routes';
import seasonalChecklistRoutes from './routes/seasonalChecklist.routes';
import homeBuyerTaskRoutes from './routes/homeBuyerTask.routes';
import propertyMaintenanceTaskRoutes from './routes/propertyMaintenanceTask.routes';
import inventoryRoutes from './routes/inventory.routes';
import { insuranceQuoteRouter } from './routes/insuranceQuote.routes';
import claimsRoutes from './routes/claims.routes';
import incidentsRouter from './routes/incidents.routes';
import recallsRoutes from './routes/recalls.routes';
import roomInsightsRoutes from './routes/roomInsights.routes';
import roomPlantAdvisorRoutes from './routes/roomPlantAdvisor.routes';
import homeEventsRoutes from './routes/homeEvents.routes';
import propertyTaxRoutes from './routes/propertyTax.routes';
import homeCostGrowthRoutes from './routes/homeCostGrowth.routes';
import insuranceCostTrendRoutes from './routes/insuranceCostTrend.routes';
import costExplainerRoutes from './routes/costExplainer.routes';
import trueCostOwnershipRoutes from './routes/trueCostOwnership.routes';
import sellHoldRentRoutes from './routes/sellHoldRent.routes';
import propertyFinanceSnapshotRoutes from './routes/propertyFinanceSnapshot.routes';
import toolOverrideRoutes from './routes/toolOverride.routes';
import costVolatilityRoutes from './routes/costVolatility.routes';
import breakEvenRoutes from './routes/breakEven.routes';
import propertyOnboardingRoutes from './routes/propertyOnboarding.routes';
import coverageAnalysisRoutes from './routes/coverageAnalysis.routes';
import riskPremiumOptimizerRoutes from './routes/riskPremiumOptimizer.routes';
import doNothingSimulatorRoutes from './routes/doNothingSimulator.routes';
import propertyScoreSnapshotRoutes from './routes/propertyScoreSnapshot.routes';
import homeCapitalTimelineRoutes from './routes/homeCapitalTimeline.routes';
import dailyHomePulseRoutes from './routes/dailyHomePulse.routes';
import homeScoreReportRoutes from './routes/homeScoreReport.routes';
import homeSavingsRoutes from './routes/homeSavings.routes';
import homeStatusBoardRoutes from './routes/homeStatusBoard.routes';
import inventoryVerificationRoutes from './routes/inventoryVerification.routes';
import maintenancePredictionRoutes from './routes/maintenancePrediction.routes';
import weatherRoutes from './routes/weather.routes';
import servicePriceRadarRoutes from './routes/servicePriceRadar.routes';
import negotiationShieldRoutes from './routes/negotiationShield.routes';
import priceFinalizationRoutes from './routes/priceFinalization.routes';
import homeEventRadarRoutes from './routes/homeEventRadar.routes';
import homeRiskReplayRoutes from './routes/homeRiskReplay.routes';
import guidanceRoutes from './routes/guidance.routes';
import vaultRoutes from './routes/vault.routes';
import narrativeRoutes from './routes/narrative.routes';
import knowledgeHubRoutes from './routes/knowledgeHub.routes';
import knowledgeHubAdminRoutes from './routes/knowledgeHubAdmin.routes';
import homeDigitalWillRoutes from './routes/homeDigitalWill.routes';
import hiddenAssetsRoutes from './routes/hiddenAssets.routes';
import homeDigitalTwinRoutes from './routes/homeDigitalTwin.routes';
import neighborhoodIntelligenceRoutes from './neighborhoodIntelligence/neighborhoodIntelligence.routes';
import adminAnalyticsRoutes from './routes/adminAnalytics.routes';
import navigationAnalyticsRoutes from './routes/navigationAnalytics.routes';
import adminWorkerJobsRoutes from './routes/adminWorkerJobs.routes';
import adminSharedDataRoutes from './routes/adminSharedData.routes';
import homeHabitCoachRoutes from './routes/homeHabitCoach.routes';
import homeRenovationAdvisorRoutes from './homeRenovationAdvisor/homeRenovationAdvisor.routes';
import refinanceRadarRoutes from './refinanceRadar/refinanceRadar.routes';
import gazetteRoutes from './modules/gazette/gazette.routes';
import gazetteInternalRoutes from './modules/gazette/gazetteInternal.routes';
import sharedDataRoutes from './routes/sharedData.routes';
import releaseGateRoutes from './routes/releaseGate.routes';
import mfaRoutes from './routes/mfa.routes';
import { logger, auditLog } from './lib/logger';
import { register } from './lib/metrics';
import { metricsMiddleware } from './middleware/metrics.middleware';
import { requestIdMiddleware } from './middleware/requestId.middleware';
dotenv.config();

const app = express();

// Trust proxy for Cloudflare Tunnel
app.set('trust proxy', 1);
const PORT = process.env.PORT || 8080;


// =============================================================================
// MIDDLEWARE
// =============================================================================

// Attach a unique request ID to each request for tracing logs
app.use(requestIdMiddleware);

// Helmet with full defaults (CSP enabled) for all API routes.
// Swagger UI requires unsafe-inline scripts, so CSP is disabled only on /api/docs.
app.use(helmet());
app.use('/api/docs', helmet({ contentSecurityPolicy: false }));
// CORS: origins are driven by the ALLOWED_ORIGINS env var (comma-separated).
// In production the variable is required; in development it falls back to
// localhost so the dev server works without any configuration.
const rawOrigins = (process.env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const isProduction = process.env.NODE_ENV === 'production';
if (isProduction && rawOrigins.length === 0) {
  throw new Error('FATAL: ALLOWED_ORIGINS must be set in production (comma-separated list of allowed frontend origins)');
}
const allowedOrigins = rawOrigins.length > 0 ? rawOrigins : ['http://localhost:3000'];

app.use(cors({
  origin: (origin, callback) => {
    // Allow same-origin requests (origin is undefined for server-to-server calls)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      auditLog('CORS_BLOCKED', null, { origin });
      callback(new Error('Not allowed by CORS policy'));
    }
  },
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// cookie-parser must run before csrfProtection so req.cookies is populated.
app.use(cookieParser());

// CSP violation reports — mounted BEFORE csrfProtection because browsers send
// these as automated POSTs without an Authorization or x-csrf-token header.
// A dedicated body-parser accepts the browser's application/csp-report MIME type.
app.use(
  '/api',
  express.json({
    type: ['application/csp-report', 'application/reports+json'],
    limit: '4kb',
  }),
  cspReportRoutes
);

// CSRF protection — guards mutating requests that arrive via cookie-based auth.
// Requests using Authorization: Bearer <token> are skipped (see csrf.middleware.ts).
app.use('/api', csrfProtection);

// Apply global API rate limiting at the app boundary so all /api/* routes
// are covered, including any that do not self-apply a per-route limiter.
app.use('/api', apiRateLimiter);

// Record HTTP request count and duration for all routes.
app.use(metricsMiddleware);

if (process.env.NODE_ENV === 'development') {
  app.use((req: Request, res: Response, next: NextFunction) => {
    logger.info(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
  });
}

// =============================================================================
// SWAGGER/OPENAPI DOCUMENTATION
// =============================================================================

const SWAGGER_USER = process.env.SWAGGER_USER || 'admin';
const SWAGGER_PASSWORD = process.env.SWAGGER_PASSWORD;

// In production the password is mandatory — fail fast at startup rather than
// silently exposing the full API spec to the public internet.
if (process.env.NODE_ENV === 'production' && !SWAGGER_PASSWORD) {
  throw new Error('SWAGGER_PASSWORD environment variable must be set in production');
}

// Gate BOTH the Swagger UI (/api/docs) AND the raw JSON spec
// (/api/docs/swagger.json) behind Basic Auth.
// Express prefix-matching means app.use('/api/docs', ...) intercepts every
// request whose path starts with /api/docs — including /api/docs/swagger.json.
if (SWAGGER_PASSWORD) {
  app.use('/api/docs', basicAuth({
    users: { [SWAGGER_USER]: SWAGGER_PASSWORD },
    challenge: true,
    realm: 'Contract to Cozy API Documentation',
  }));
}

// OpenAPI JSON spec endpoint — registered AFTER the auth gate above
app.get('/api/docs/swagger.json', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// Swagger UI — single mount, no duplication
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(null, {
  swaggerOptions: {
    url: '/api/docs/swagger.json',
    persistAuthorization: true,
  },
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Contract to Cozy API Documentation',
}));

// =============================================================================
// HEALTH CHECK ROUTES
// =============================================================================

/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: Health check endpoint
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: healthy
 *                 service:
 *                   type: string
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 environment:
 *                   type: string
 */
app.get('/api/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'healthy',
    service: 'backend',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
});

/**
 * @swagger
 * /api/ready:
 *   get:
 *     summary: Readiness check endpoint
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service is ready
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                 service:
 *                   type: string
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 */
app.get('/api/ready', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'ready',
    service: 'backend',
    timestamp: new Date().toISOString(),
  });
});

// Internal-only guard for the deep health endpoint.
// Allows requests from loopback (127.0.0.0/8), RFC-1918 private ranges,
// and the IPv6 loopback. Kubernetes liveness/readiness probes run from
// within the pod or cluster network — both are covered by this allowlist.
const INTERNAL_CIDR_RE =
  /^(127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|::1$|^$)/;

function requireInternalNetwork(req: Request, res: Response, next: NextFunction): void {
  const ip = (req.ip ?? '').replace(/^::ffff:/, ''); // normalise IPv4-mapped IPv6
  if (!INTERNAL_CIDR_RE.test(ip)) {
    res.status(403).json({ success: false, error: { message: 'Forbidden', code: 'FORBIDDEN' } });
    return;
  }
  next();
}

app.get('/api/health/deep', requireInternalNetwork, async (req: Request, res: Response) => {
  const deepHealth = await runDeepHealthChecks({
    checkDatabase: async () => {
      await prisma.$queryRaw`SELECT 1`;
    },
    redisConfigured: Boolean(process.env.REDIS_HOST),
    pingRedis: () => redis.ping(),
    redisTimeoutMs: Number(process.env.HEALTH_REDIS_TIMEOUT_MS || 1500),
  });

  res.status(deepHealth.httpStatus).json({
    status: deepHealth.status,
    service: 'backend',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    checks: deepHealth.checks,
  });
});

// =============================================================================
// PROMETHEUS METRICS
// =============================================================================

// Exposed on the same port as the API so the existing PodMonitor scraping
// port 8080 at /metrics works without any changes.
// The route is intentionally NOT behind apiRateLimiter — Prometheus scrapes
// every 15 s and should never be throttled.
// Auth: requires Bearer token matching METRICS_BEARER_TOKEN env var.
const METRICS_TOKEN = process.env.METRICS_BEARER_TOKEN;
if (process.env.NODE_ENV === 'production' && !METRICS_TOKEN) {
  throw new Error('METRICS_BEARER_TOKEN environment variable must be set in production');
}

app.get('/metrics', async (req: Request, res: Response) => {
  // Always require the token — return 503 if not configured so the endpoint
  // is never silently open in dev/staging environments.
  if (!METRICS_TOKEN) {
    res.status(503).json({ error: 'Metrics endpoint not configured' });
    return;
  }
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${METRICS_TOKEN}`) {
    res.status(401).set('WWW-Authenticate', 'Bearer realm="metrics"').end();
    return;
  }
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// =============================================================================
// ROOT ENDPOINT
// =============================================================================

/**
 * @swagger
 * /:
 *   get:
 *     summary: API root endpoint
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: API information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 service:
 *                   type: string
 *                 version:
 *                   type: string
 *                 status:
 *                   type: string
 *                 documentation:
 *                   type: string
 *                 endpoints:
 *                   type: object
 */
app.get('/', (req: Request, res: Response) => {
  res.json({
    service: 'Contract to Cozy API',
    version: '1.3.0',
    status: 'running',
    documentation: '/api/docs',
    endpoints: {
      health: '/api/health',
      ready: '/api/ready',
      auth: '/api/auth',
      providers: '/api/providers',
      bookings: '/api/bookings',
      properties: '/api/properties',
      users: '/api/users',
      checklist: '/api/checklist',
      serviceCategories: '/api/service-categories',
      community: '/api/community',
    },
  });
});

// =============================================================================
// API ROUTES
// =============================================================================

// CSRF token endpoint — returns a fresh token and sets the csrf cookie.
// Frontend calls GET /api/csrf-token once on load; passes the returned token
// as x-csrf-token on all subsequent mutating (non-Bearer) requests.
app.get('/api/csrf-token', getCsrfToken);

app.use('/api/auth', authRoutes);
app.use('/api', mfaRoutes);
app.use('/api/providers', providerRoutes);
app.use('/api/bookings', bookingRoutes);
// Keep vault public and mount before any generic '/api' routers that apply auth middleware.
app.use('/api/vault', vaultRoutes);
// Keep Knowledge Hub public and mount before generic '/api' routers with internal auth middleware.
app.use('/api', knowledgeHubRoutes);
app.use('/api', homeReportExportRoutes);
app.use('/api/properties', propertyRoutes);
app.use('/api/users', userRoutes);
app.use('/api/checklist', checklistRoutes);
app.use('/api/service-categories', serviceCategoryRoutes);
app.use('/api/maintenance-templates', maintenanceRoutes);
app.use('/api/home-management', homeownerManagementRoutes);
app.use('/api/risk', riskRoutes);

// Financial efficiency routes
app.use('/api/v1/financial-efficiency', financialRoutes); 
app.use('/api/v1/properties', financialRoutes);

// Community routes (NEW)
app.use(communityRoutes(prisma));

// Other feature routes
app.use('/api/gemini', geminiRoutes);
app.use('/api/emergency', emergencyRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/oracle', oracleRoutes);
app.use('/api/budget', budgetRoutes);
app.use('/api/climate', climateRoutes);
app.use('/api/modifications', modificationRoutes);
app.use('/api/appreciation', appreciationRoutes);
app.use('/api/energy', energyRoutes);
app.use('/api/visual-inspector', visualInspectorRoutes);
app.use('/api/tax-appeal', taxAppealRoutes);
app.use('/api/moving-concierge', movingConciergeRoutes);
app.use('/api/seller-prep', sellerPrepRoutes);
app.use('/api/inspection-reports', inspectionReportRoutes);
app.use('/api/local-updates', localUpdatesRoutes);
app.use('/api/orchestration', orchestrationRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api', seasonalChecklistRoutes);
app.use('/api/home-buyer-tasks', homeBuyerTaskRoutes);
app.use('/api/maintenance-tasks', propertyMaintenanceTaskRoutes);
app.use('/api', inventoryRoutes);
app.use('/api', insuranceQuoteRouter);
app.use('/api', claimsRoutes);
app.use('/api', incidentsRouter);
app.use('/api', recallsRoutes);
app.use('/api', roomInsightsRoutes);
app.use('/api', roomPlantAdvisorRoutes);
app.use('/api', homeEventsRoutes);
app.use('/api', propertyTaxRoutes);
app.use('/api', homeCostGrowthRoutes);
app.use('/api', insuranceCostTrendRoutes);
app.use('/api', costExplainerRoutes);
app.use('/api', sellHoldRentRoutes);
app.use('/api', propertyFinanceSnapshotRoutes);
app.use('/api', toolOverrideRoutes);
app.use('/api', sharedDataRoutes);
app.use('/api', costVolatilityRoutes);
app.use('/api', breakEvenRoutes);
app.use('/api', propertyOnboardingRoutes);
app.use('/api', coverageAnalysisRoutes);
app.use('/api', riskPremiumOptimizerRoutes);
app.use('/api', doNothingSimulatorRoutes);
app.use('/api', propertyScoreSnapshotRoutes);
app.use('/api', dailyHomePulseRoutes);
app.use('/api', homeScoreReportRoutes);
app.use('/api', homeSavingsRoutes);
app.use('/api', trueCostOwnershipRoutes);
app.use('/api', homeCapitalTimelineRoutes);
app.use('/api', negotiationShieldRoutes);
app.use('/api', homeEventRadarRoutes);
app.use('/api', homeRiskReplayRoutes);
app.use('/api', guidanceRoutes);
app.use('/api', servicePriceRadarRoutes);
app.use('/api', priceFinalizationRoutes);
app.use('/api', homeStatusBoardRoutes);
app.use('/api', inventoryVerificationRoutes);
app.use('/api', maintenancePredictionRoutes);
app.use('/api', narrativeRoutes);
app.use('/api', knowledgeHubAdminRoutes);
app.use('/api', homeDigitalWillRoutes);
app.use('/api', hiddenAssetsRoutes);
app.use('/api', homeDigitalTwinRoutes);
app.use('/api', neighborhoodIntelligenceRoutes);
app.use('/api', adminAnalyticsRoutes);
app.use('/api', navigationAnalyticsRoutes);
app.use('/api', adminWorkerJobsRoutes);
app.use('/api', adminSharedDataRoutes);
app.use('/api', homeHabitCoachRoutes);
app.use('/api', homeRenovationAdvisorRoutes);
app.use('/api', refinanceRadarRoutes);
app.use('/api', gazetteRoutes);
app.use('/api', gazetteInternalRoutes);
app.use('/api/weather', weatherRoutes);
app.use('/api/admin/release-gates', authenticate, requireMfa, requireRole(UserRole.ADMIN), releaseGateRoutes);

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
  });
});

// =============================================================================
// ERROR HANDLER (MUST BE LAST)
// =============================================================================

// Sentry error handler must come BEFORE the custom errorHandler so it can
// capture unhandled exceptions before they are swallowed and formatted.
Sentry.setupExpressErrorHandler(app);

app.use(errorHandler);

// =============================================================================
// START SERVER
// =============================================================================

app.listen(PORT, () => {
  logger.info(`🚀 Server running on port ${PORT}`);
  logger.info(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`🔗 API URL: http://localhost:${PORT}`);
  logger.info(`✅ Health check: http://localhost:${PORT}/api/health`);
  logger.info(`📚 API Docs: http://localhost:${PORT}/api/docs`);
  logger.info(`\n📋 Available routes:`);
  logger.info(`   - POST /api/auth/register`);
  logger.info(`   - POST /api/auth/login`);
  logger.info(`   - GET  /api/auth/me`);
  logger.info(`   - POST /api/auth/logout`);
  logger.info(`   - GET  /api/providers/search`);
  logger.info(`   - GET  /api/bookings`);
  logger.info(`   - GET  /api/properties`);
  logger.info(`   - GET  /api/users/profile`);
  logger.info(`   - PUT  /api/users/profile`);
  logger.info(`   - GET  /api/checklist`);
  logger.info(`   - PUT  /api/checklist/items/:itemId`);
  logger.info(`   - GET  /api/service-categories`);
  logger.info(`   - GET  /api/service-categories/all`);
  logger.info(`   - GET  /api/risk/property/:propertyId/report`);
  logger.info(`   - POST /api/risk/calculate/:propertyId`);
  logger.info(`   - GET  /api/community/alerts`);
  logger.info(`   - GET  /api/community/trash`);
  logger.info(`   - GET  /api/v1/community/events`);
  logger.info(`   - GET  /api/inventory`);
  logger.info(`   - GET  /api/room-insights`);
  logger.info(`   - GET  /api/knowledge/articles`);
  logger.info(`   - PATCH  /api/room-insights/rooms/:roomId/profile`);
  logger.info(`   - GET  /api/room-insights/rooms/:roomId/checklist-items`);
  logger.info(`   - POST /api/room-insights/rooms/:roomId/checklist-items`);
  logger.info(`   - PATCH /api/room-insights/rooms/:roomId/checklist-items/:itemId`);
  logger.info(`   - DELETE /api/room-insights/rooms/:roomId/checklist-items/:itemId`);
  logger.info(`   - GET  /api/room-insights/rooms/:roomId/timeline`);
  logger.info(`   - GET  /api/home-events`);
});

export default app;
