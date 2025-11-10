// apps/backend/src/index.ts

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';

// Import routes
import authRoutes from './routes/auth.routes';
import providerRoutes from './routes/provider.routes';
import bookingRoutes from './routes/booking.routes';

// Import middleware
import { errorHandler } from './middleware/error.middleware';
import propertyRoutes from './routes/property.routes';

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
    message: 'Contract to Cozy API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/api/health',
      ready: '/api/ready',
      auth: {
        register: 'POST /api/auth/register',
        login: 'POST /api/auth/login',
        refresh: 'POST /api/auth/refresh',
        logout: 'POST /api/auth/logout (auth)',
        me: 'GET /api/auth/me (auth)',
        verifyEmail: 'POST /api/auth/verify-email',
        forgotPassword: 'POST /api/auth/forgot-password',
        resetPassword: 'POST /api/auth/reset-password',
      },
      providers: {
        search: 'GET /api/providers/search',
        details: 'GET /api/providers/:id',
        services: 'GET /api/providers/:id/services',
        reviews: 'GET /api/providers/:id/reviews',
      },
      bookings: {
        create: 'POST /api/bookings (auth)',
        list: 'GET /api/bookings (auth)',
        get: 'GET /api/bookings/:id (auth)',
        update: 'PUT /api/bookings/:id (auth)',
        confirm: 'POST /api/bookings/:id/confirm (auth)',
        start: 'POST /api/bookings/:id/start (auth)',
        complete: 'POST /api/bookings/:id/complete (auth)',
        cancel: 'POST /api/bookings/:id/cancel (auth)',
      },
    },
  });
});

// =============================================================================
// API ROUTES
// =============================================================================

// Auth routes (public)
app.use('/api/auth', authRoutes);

// Provider routes (public)
app.use('/api/providers', providerRoutes);

// Booking routes (protected - requires authentication)
app.use('/api/bookings', bookingRoutes);

// Property routes (protected - requires authentication)\\
app.use('/api/properties', propertyRoutes);

// =============================================================================
// ERROR HANDLING
// =============================================================================

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    path: req.path,
  });
});

// Global error handler
app.use(errorHandler);

// =============================================================================
// START SERVER
// =============================================================================

app.listen(PORT, () => {
  console.log('🚀 Contract to Cozy Backend Server');
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🌐 Server running on http://localhost:${PORT}`);
  console.log(`\n📚 Available endpoints:`);
  console.log(`   GET  /api/health - Health check`);
  console.log(`\n🔐 Auth endpoints:`);
  console.log(`   POST /api/auth/register - Register new user`);
  console.log(`   POST /api/auth/login - Login`);
  console.log(`   POST /api/auth/refresh - Refresh token`);
  console.log(`   POST /api/auth/logout - Logout (auth)`);
  console.log(`   GET  /api/auth/me - Get current user (auth)`);
  console.log(`\n🔍 Provider endpoints:`);
  console.log(`   GET  /api/providers/search - Search providers`);
  console.log(`   GET  /api/providers/:id - Get provider details`);
  console.log(`   GET  /api/providers/:id/services - Get provider services`);
  console.log(`   GET  /api/providers/:id/reviews - Get provider reviews`);
  console.log(`\n📅 Booking endpoints (require auth):`);
  console.log(`   POST /api/bookings - Create booking`);
  console.log(`   GET  /api/bookings - List bookings`);
  console.log(`   GET  /api/bookings/:id - Get booking details`);
  console.log(`   PUT  /api/bookings/:id - Update booking`);
  console.log(`   POST /api/bookings/:id/confirm - Confirm booking`);
  console.log(`   POST /api/bookings/:id/start - Start booking`);
  console.log(`   POST /api/bookings/:id/complete - Complete booking`);
  console.log(`   POST /api/bookings/:id/cancel - Cancel booking`);
  console.log(`\n✨ Ready to accept connections!`);
});

export default app;
