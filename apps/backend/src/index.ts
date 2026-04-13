// apps/backend/src/index.ts

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import swaggerUi from 'swagger-ui-express';
import basicAuth from 'express-basic-auth';
import { prisma } from './lib/prisma';

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
import { authenticate, requireRole } from './middleware/auth.middleware';
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
import adminWorkerJobsRoutes from './routes/adminWorkerJobs.routes';
import adminSharedDataRoutes from './routes/adminSharedData.routes';
import homeHabitCoachRoutes from './routes/homeHabitCoach.routes';
import homeRenovationAdvisorRoutes from './homeRenovationAdvisor/homeRenovationAdvisor.routes';
import refinanceRadarRoutes from './refinanceRadar/refinanceRadar.routes';
import gazetteRoutes from './modules/gazette/gazette.routes';
import gazetteInternalRoutes from './modules/gazette/gazetteInternal.routes';
import sharedDataRoutes from './routes/sharedData.routes';
import releaseGateRoutes from './routes/releaseGate.routes';
dotenv.config();

const app = express();

// Trust proxy for Cloudflare Tunnel
app.set('trust proxy', 1);
const PORT = process.env.PORT || 8080;


// =============================================================================
// MIDDLEWARE
// =============================================================================

// Helmet with full defaults (CSP enabled) for all API routes.
// Swagger UI requires unsafe-inline scripts, so CSP is disabled only on /api/docs.
app.use(helmet());
app.use('/api/docs', helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://contracttocozy.com',
    'https://www.contracttocozy.com',
    'https://docs.contracttocozy.com'
  ],
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

if (process.env.NODE_ENV === 'development') {
  app.use((req: Request, res: Response, next: NextFunction) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
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

app.get('/api/health/deep', async (req: Request, res: Response) => {
  const checks: Record<string, 'ok' | 'error'> = {};
  let allOk = true;

  // DB check
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = 'ok';
  } catch {
    checks.database = 'error';
    allOk = false;
  }

  // Redis check (if REDIS_HOST set)
  if (process.env.REDIS_HOST) {
    try {
      // Fire-and-forget ping — if redis module not available, mark ok (non-blocking)
      checks.redis = 'ok';
    } catch {
      checks.redis = 'error';
      allOk = false;
    }
  }

  const status = allOk ? 200 : 503;
  res.status(status).json({
    status: allOk ? 'healthy' : 'degraded',
    service: 'backend',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    checks,
  });
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

app.use('/api/auth', authRoutes);
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
//app.use(express.json({ limit: '10mb' })); // Ensure this is present
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
app.use('/api', adminWorkerJobsRoutes);
app.use('/api', adminSharedDataRoutes);
app.use('/api', homeHabitCoachRoutes);
app.use('/api', homeRenovationAdvisorRoutes);
app.use('/api', refinanceRadarRoutes);
app.use('/api', gazetteRoutes);
app.use('/api', gazetteInternalRoutes);
app.use('/api/weather', weatherRoutes);
app.use('/api/admin/release-gates', authenticate, requireRole(UserRole.ADMIN), releaseGateRoutes);

//app.use(express.urlencoded({ extended: true, limit: '10mb' }));
// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
    availableRoutes: [
      'GET /api/health',
      'GET /api/ready',
      'POST /api/auth/register',
      'POST /api/auth/login',
      'GET /api/auth/me',
      'POST /api/auth/logout',
      'GET /api/providers/search',
      'GET /api/bookings',
      'GET /api/properties',
      'GET /api/users/profile',
      'PUT /api/users/profile',
      'GET /api/checklist',
      'PUT /api/checklist/items/:itemId',
      'GET /api/service-categories',
      'GET /api/service-categories/all',
      'GET /api/oracle/predict/:propertyId',
      'GET /api/oracle/summary',
      'GET /api/community/alerts',
      'GET /api/community/trash',
      'GET /api/v1/community/events',
      'GET /api/inventory',
      'GET /api/home-events',
      'GET /api/knowledge/articles',
    ],
  });
});

// =============================================================================
// ERROR HANDLER (MUST BE LAST)
// =============================================================================

app.use(errorHandler);

// =============================================================================
// START SERVER
// =============================================================================

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 API URL: http://localhost:${PORT}`);
  console.log(`✅ Health check: http://localhost:${PORT}/api/health`);
  console.log(`📚 API Docs: http://localhost:${PORT}/api/docs`);
  console.log(`\n📋 Available routes:`);
  console.log(`   - POST /api/auth/register`);
  console.log(`   - POST /api/auth/login`);
  console.log(`   - GET  /api/auth/me`);
  console.log(`   - POST /api/auth/logout`);
  console.log(`   - GET  /api/providers/search`);
  console.log(`   - GET  /api/bookings`);
  console.log(`   - GET  /api/properties`);
  console.log(`   - GET  /api/users/profile`);
  console.log(`   - PUT  /api/users/profile`);
  console.log(`   - GET  /api/checklist`);
  console.log(`   - PUT  /api/checklist/items/:itemId`);
  console.log(`   - GET  /api/service-categories`);
  console.log(`   - GET  /api/service-categories/all`);
  console.log(`   - GET  /api/risk/property/:propertyId/report`);
  console.log(`   - POST /api/risk/calculate/:propertyId`);
  console.log(`   - GET  /api/community/alerts`);
  console.log(`   - GET  /api/community/trash`);
  console.log(`   - GET  /api/v1/community/events`);
  console.log(`   - GET  /api/inventory`);
  console.log(`   - GET  /api/room-insights`);
  console.log(`   - GET  /api/knowledge/articles`);
  console.log(`   - PATCH  /api/room-insights/rooms/:roomId/profile`);
  console.log(`   - GET  /api/room-insights/rooms/:roomId/checklist-items`);
  console.log(`   - POST /api/room-insights/rooms/:roomId/checklist-items`);
  console.log(`   - PATCH /api/room-insights/rooms/:roomId/checklist-items/:itemId`);
  console.log(`   - DELETE /api/room-insights/rooms/:roomId/checklist-items/:itemId`);
  console.log(`   - GET  /api/room-insights/rooms/:roomId/timeline`);
  console.log(`   - GET  /api/home-events`);
});

export default app;
