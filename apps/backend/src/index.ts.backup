// apps/backend/src/index.ts

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import providerRoutes from './routes/provider.routes';
import bookingRoutes from './routes/booking.routes';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

// =============================================================================
// MIDDLEWARE
// =============================================================================

// Security headers
app.use(helmet());

// CORS configuration
app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  })
);

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging (development only)
if (process.env.NODE_ENV !== 'production') {
  app.use((req: Request, res: Response, next: NextFunction) => {
    console.log(`${req.method} ${req.path}`, {
      query: req.query,
      body: req.body,
    });
    next();
  });
}

// =============================================================================
// HEALTH CHECK ENDPOINTS
// =============================================================================

app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    service: 'backend',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
});

app.get('/api/ready', (req: Request, res: Response) => {
  res.json({
    status: 'ready',
    service: 'backend',
    timestamp: new Date().toISOString(),
  });
});

app.get('/', (req: Request, res: Response) => {
  res.json({
    message: 'Contract to Cozy API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/api/health',
      ready: '/api/ready',
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

// Provider routes (public)
app.use('/api/providers', providerRoutes);

// Booking routes (protected - requires authentication)
app.use('/api/bookings', bookingRoutes);

// TODO: Add auth routes
// app.use('/api/auth', authRoutes);

// TODO: Add booking routes (protected)
// app.use('/api/bookings', authenticate, bookingRoutes);

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
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err);

  // Don't leak error details in production
  const message =
    process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message;

  res.status(500).json({
    success: false,
    message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
});

// =============================================================================
// START SERVER
// =============================================================================

app.listen(PORT, () => {
  console.log('🚀 Contract to Cozy Backend Server');
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🌐 Server running on http://localhost:${PORT}`);
  console.log(`\n📚 Available endpoints:`);
  console.log(`   GET  /api/health - Health check`);
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
