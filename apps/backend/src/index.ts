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
import userRoutes from './routes/user.routes';  // NEW: User profile routes

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

// Security middleware
app.use(helmet());

// CORS configuration
app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://contracttocozy.com',
    'https://www.contracttocozy.com'
  ],
  credentials: true,
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware (development only)
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
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/api/health',
      ready: '/api/ready',
      auth: '/api/auth',
      providers: '/api/providers',
      bookings: '/api/bookings',
      properties: '/api/properties',
      users: '/api/users',  // NEW: Added to endpoint list
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
app.use('/api/users', userRoutes);  // NEW: User profile routes

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
      'GET /api/users/profile',  // NEW: Added to available routes
      'PUT /api/users/profile',  // NEW: Added to available routes
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
  console.log(`   - GET  /api/users/profile       ← NEW`);
  console.log(`   - PUT  /api/users/profile       ← NEW`);
});

export default app;
