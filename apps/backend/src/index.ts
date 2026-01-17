// apps/backend/src/index.ts

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import swaggerUi from 'swagger-ui-express';
import basicAuth from 'express-basic-auth';
import { PrismaClient } from '@prisma/client';

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
import homeEventsRoutes from './routes/homeEvents.routes';
import propertyTaxRoutes from './routes/propertyTax.routes';
import homeCostGrowthRoutes from './routes/homeCostGrowth.routes';
import insuranceCostTrendRoutes from './routes/insuranceCostTrend.routes';
import costExplainerRoutes from './routes/costExplainer.routes';
import trueCostOwnershipRoutes from './routes/trueCostOwnership.routes';
dotenv.config();

// Initialize Prisma Client
const prisma = new PrismaClient();

const app = express();

// Trust proxy for Cloudflare Tunnel
app.set('trust proxy', 1);
const PORT = process.env.PORT || 8080;

const SWAGGER_USER = process.env.SWAGGER_USER || 'admin';
const SWAGGER_PASSWORD = process.env.SWAGGER_PASSWORD;

// Apply Basic Auth to the docs route if a password is provided
if (SWAGGER_PASSWORD) {
  app.use('/api/docs', basicAuth({
    users: { [SWAGGER_USER]: SWAGGER_PASSWORD },
    challenge: true, // This triggers the browser login popup
    realm: 'Contract to Cozy API Documentation'
  }));
}

// 3. Mount Swagger UI (Keep your existing config)
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(null, {
  swaggerOptions: {
    url: '/api/docs/swagger.json',
    persistAuthorization: true, // This keeps the JWT token saved even after refresh
  },
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Contract to Cozy API Documentation',
}));

// =============================================================================
// MIDDLEWARE
// =============================================================================

app.use(helmet({
  contentSecurityPolicy: false, // Allow Swagger UI inline scripts
}));
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

// OpenAPI JSON spec endpoint (MUST come BEFORE Swagger UI)
app.get('/api/docs/swagger.json', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// Protect Swagger UI in production (optional)
if (process.env.NODE_ENV === 'production' && process.env.SWAGGER_PASSWORD) {
  app.use('/api/docs', basicAuth({
    users: { 
      'admin': process.env.SWAGGER_PASSWORD 
    },
    challenge: true,
    realm: 'Contract to Cozy API Documentation'
  }));
}

// Mount Swagger UI
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(null, {
  swaggerOptions: {
    url: '/api/docs/swagger.json',  // Fetch spec from this URL
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
app.use('/api', homeEventsRoutes);
app.use('/api', propertyTaxRoutes);
app.use('/api', homeCostGrowthRoutes);
app.use('/api', insuranceCostTrendRoutes);
app.use('/api', costExplainerRoutes);
//app.use(express.json({ limit: '10mb' })); // Ensure this is present
app.use('/api', trueCostOwnershipRoutes);
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
  console.log(`   - PATCH  /api/room-insights/rooms/:roomId/profile`);
  console.log(`   - GET  /api/room-insights/rooms/:roomId/checklist-items`);
  console.log(`   - POST /api/room-insights/rooms/:roomId/checklist-items`);
  console.log(`   - PATCH /api/room-insights/rooms/:roomId/checklist-items/:itemId`);
  console.log(`   - DELETE /api/room-insights/rooms/:roomId/checklist-items/:itemId`);
  console.log(`   - GET  /api/room-insights/rooms/:roomId/timeline`);
  console.log(`   - GET  /api/home-events`);
});

export default app;