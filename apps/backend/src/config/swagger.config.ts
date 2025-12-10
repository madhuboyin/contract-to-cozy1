// apps/backend/src/config/swagger.config.ts

import swaggerJsdoc from 'swagger-jsdoc';
import path from 'path';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Contract to Cozy API',
      version: '1.3.0',
      description: 'Property management platform API connecting homeowners with service providers',
      contact: {
        name: 'API Support',
        email: 'support@contracttocozy.com',
      },
    },
    servers: [
      {
        url: 'https://api.contracttocozy.com',
        description: 'Production server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter your JWT token',
        },
      },
      responses: {
        UnauthorizedError: {
          description: 'Access token is missing or invalid',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: false },
                  error: {
                    type: 'object',
                    properties: {
                      message: { type: 'string', example: 'Unauthorized' },
                      code: { type: 'string', example: 'UNAUTHORIZED' },
                    },
                  },
                },
              },
            },
          },
        },
        ValidationError: {
          description: 'Validation failed',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: false },
                  error: {
                    type: 'object',
                    properties: {
                      message: { type: 'string', example: 'Validation failed' },
                      code: { type: 'string', example: 'VALIDATION_ERROR' },
                      details: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            field: { type: 'string' },
                            message: { type: 'string' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    tags: [
      { name: 'Auth', description: 'Authentication endpoints' },
      { name: 'Properties', description: 'Property management' },
      { name: 'Providers', description: 'Service provider operations' },
      { name: 'Bookings', description: 'Booking management' },
      { name: 'Users', description: 'User profile management' },
      { name: 'Checklist', description: 'Maintenance checklist' },
      { name: 'Home Management', description: 'Documents, warranties, insurance' },
      { name: 'Risk Assessment', description: 'Property risk analysis' },
      { name: 'Financial Efficiency', description: 'Financial efficiency scores' },
      { name: 'AI Chat', description: 'Gemini AI assistant' },
      { name: 'Maintenance', description: 'Maintenance templates' },
      { name: 'Service Categories', description: 'Service categories' },
      { name: 'Health', description: 'Health check endpoints' },
    ],
  },
  // Use absolute paths from this file's location
  apis: [
    path.join(__dirname, '../routes/**/*.ts'),
    path.join(__dirname, '../routes/**/*.js'),
    path.join(__dirname, '../index.ts'),
    path.join(__dirname, '../index.js'),
  ],
};

export const swaggerSpec = swaggerJsdoc(options);

// Debug output
console.log('📚 Swagger config loaded from:', __dirname);
console.log('📚 Scanning paths:', options.apis);
console.log('📚 Found endpoints:', Object.keys((swaggerSpec as any).paths || {}).length);