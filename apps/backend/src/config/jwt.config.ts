// JWT Configuration
export const jwtConfig = {
  // Access token (short-lived)
  accessToken: {
    secret: process.env.JWT_ACCESS_SECRET || 'your-access-token-secret-change-in-production',
    expiresIn: '15m', // 15 minutes
  },
  
  // Refresh token (long-lived)
  refreshToken: {
    secret: process.env.JWT_REFRESH_SECRET || 'your-refresh-token-secret-change-in-production',
    expiresIn: '7d', // 7 days
  },
  
  // Email verification token
  emailVerificationToken: {
    secret: process.env.JWT_EMAIL_SECRET || 'your-email-verification-secret',
    expiresIn: '24h', // 24 hours
  },
  
  // Password reset token
  passwordResetToken: {
    secret: process.env.JWT_PASSWORD_RESET_SECRET || 'your-password-reset-secret',
    expiresIn: '1h', // 1 hour
  },
};

export const authConfig = {
  // Password requirements
  password: {
    minLength: 8,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: true,
  },
  
  // Bcrypt rounds
  bcryptRounds: 10,
  
  // Rate limiting
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 5, // 5 requests per window
  },
};
