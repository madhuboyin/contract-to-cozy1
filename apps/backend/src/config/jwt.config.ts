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

  // MFA challenge token — short-lived bridge between password-verified and
  // TOTP-verified states. Issued after a successful password check when the
  // account has MFA enabled; exchanged for real tokens via POST /api/auth/mfa/challenge.
  mfaChallengeToken: {
    secret: process.env.JWT_MFA_SECRET || 'your-mfa-challenge-secret',
    expiresIn: '5m', // 5 minutes — tight window for the TOTP prompt
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
  
  // Rate limiting — covers /login, /register, and /refresh.
  // Keep low enough to deter brute-force but high enough that normal users
  // (occasional wrong password + automatic token refresh) don't get locked out.
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 20, // 20 requests per window per IP
  },
};
