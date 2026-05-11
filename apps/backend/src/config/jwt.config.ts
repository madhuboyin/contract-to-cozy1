const isProduction = process.env.NODE_ENV === 'production';
const MIN_PRODUCTION_SECRET_LENGTH = 32;

function resolveSecret(
  primaryEnvVar: string,
  options: {
    aliases?: string[];
    devFallback: string;
    description: string;
  }
): string {
  const candidates = [primaryEnvVar, ...(options.aliases ?? [])];

  for (const envVar of candidates) {
    const value = process.env[envVar]?.trim();
    if (!value) continue;

    if (isProduction && value.length < MIN_PRODUCTION_SECRET_LENGTH) {
      throw new Error(
        `FATAL: ${envVar} must be at least ${MIN_PRODUCTION_SECRET_LENGTH} characters for ${options.description}. ` +
        'Generate with: openssl rand -hex 32'
      );
    }

    return value;
  }

  if (isProduction) {
    throw new Error(
      `FATAL: Missing ${options.description} secret. Set one of: ${candidates.join(', ')}. ` +
      'Generate with: openssl rand -hex 32'
    );
  }

  return options.devFallback;
}

// JWT Configuration
export const jwtConfig = {
  // Access token (short-lived)
  accessToken: {
    secret: resolveSecret('JWT_SECRET', {
      aliases: ['JWT_ACCESS_SECRET'],
      devFallback: 'dev-access-token-secret-not-for-production',
      description: 'access token signing',
    }),
    expiresIn: '15m', // 15 minutes
  },

  // Refresh token (long-lived)
  refreshToken: {
    secret: resolveSecret('JWT_REFRESH_SECRET', {
      aliases: ['JWT_SECRET'],
      devFallback: 'dev-refresh-token-secret-not-for-production',
      description: 'refresh token signing',
    }),
    expiresIn: '7d', // 7 days
  },

  // Email verification token
  emailVerificationToken: {
    secret: resolveSecret('JWT_EMAIL_SECRET', {
      devFallback: 'dev-email-verification-secret-not-for-production',
      description: 'email verification token signing',
    }),
    expiresIn: '24h', // 24 hours
  },

  // Password reset token
  passwordResetToken: {
    secret: resolveSecret('JWT_PASSWORD_RESET_SECRET', {
      devFallback: 'dev-password-reset-secret-not-for-production',
      description: 'password reset token signing',
    }),
    expiresIn: '1h', // 1 hour
  },

  // MFA challenge token — short-lived bridge between password-verified and
  // TOTP-verified states. Issued after a successful password check when the
  // account has MFA enabled; exchanged for real tokens via POST /api/auth/mfa/challenge.
  mfaChallengeToken: {
    secret: resolveSecret('JWT_MFA_SECRET', {
      devFallback: 'dev-mfa-challenge-secret-not-for-production',
      description: 'MFA challenge token signing',
    }),
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
