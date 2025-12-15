// apps/backend/src/index.ts

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import swaggerUi from 'swagger-ui-express';
import basicAuth from 'express-basic-auth';

// Import swagger config
import { swaggerSpec } from './config/swagger.config';

// Import routes
import authRoutes from './routes/auth.routes';
import providerRoutes from './routes/provider.routes';
import bookingRoutes from './routes/booking.routes';
import propertyRoutes from './routes/property.routes';
import userRoutes from './routes/user.routes';
import checklistRoutes from './routes/checklist.routes'; // <-- FIX 1: Default import
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
// Import middleware
import { errorHandler } from './middleware/error.middleware';

dotenv.config();

const app = express();

// Trust proxy for Cloudflare Tunnel
app.set('trust proxy', 1);
const PORT = process.env.PORT || 8080;

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
    },
  });
});

// =============================================================================
// API ROUTES
// =============================================================================

app.use('/api/auth', authRoutes);
app.use('/api/providers', providerRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/properties', propertyRoutes);
app.use('/api/users', userRoutes);
app.use('/api/checklist', checklistRoutes); // <-- FIX 2: Mount point
app.use('/api/service-categories', serviceCategoryRoutes);
app.use('/api/maintenance-templates', maintenanceRoutes);
app.use('/api/home-management', homeownerManagementRoutes); // NEW LINE
app.use('/api/risk', riskRoutes);
// Handles: /api/v1/financial-efficiency/summary
app.use('/api/v1/financial-efficiency', financialRoutes); 
// Handles: /api/v1/properties/:propertyId/financial-efficiency/*
app.use('/api/v1/properties', financialRoutes);
// ✅ Community (NEW, on-the-fly)
import { PrismaClient } from '@prisma/client';
import { communityRoutes } from './community/community.routes';

const prisma = new PrismaClient();
app.use(communityRoutes(prisma));

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
  console.log(`   - PUT  /api/users/profile`); // <-- FIX 3: Corrected typo
  console.log(`   - GET  /api/checklist`);
  console.log(`   - PUT  /api/checklist/items/:itemId`);
  console.log(`   - GET  /api/service-categories`);
  console.log(`   - GET  /api/service-categories/all`);
  console.log(`   - GET  /api/risk/property/:propertyId/report`);
  console.log(`   - POST /api/risk/calculate/:propertyId`);
});

export default app;