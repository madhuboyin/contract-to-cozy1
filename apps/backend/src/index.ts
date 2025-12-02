// apps/backend/src/index.ts

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';

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

app.use(helmet());
app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://contracttocozy.com',
    'https://www.contracttocozy.com'
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
// HEALTH CHECK ROUTES
// =============================================================================

app.get('/api/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'healthy',
    service: 'backend',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
});

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

app.get('/', (req: Request, res: Response) => {
  res.json({
    service: 'Contract to Cozy API',
    version: '1.3.0',
    status: 'running',
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
// =============================================================================
// 404 HANDLER
// =============================================================================

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