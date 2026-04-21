import { createHash, randomUUID } from 'crypto';
import { jwtConfig } from '../config/jwt.config';
import { generateTokenPair, JWTPayload, TokenPair } from './jwt.util';

const DURATION_PATTERN = /^(\d+)([smhd])$/i;

const durationToMs = (duration: string | number): number => {
  if (typeof duration === 'number') {
    return duration * 1000;
  }

  const match = DURATION_PATTERN.exec(duration.trim());
  if (!match) {
    throw new Error(`Unsupported refresh token duration: ${duration}`);
  }

  const value = Number(match[1]);
  const unit = match[2].toLowerCase();

  const unitMs: Record<string, number> = {
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };

  return value * unitMs[unit];
};

export const hashRefreshToken = (rawToken: string): string => {
  return createHash('sha256').update(rawToken).digest('hex');
};

export const getRefreshTokenExpiresAt = (from: Date = new Date()): Date => {
  const ttlMs = durationToMs(jwtConfig.refreshToken.expiresIn);
  return new Date(from.getTime() + ttlMs);
};

export interface RefreshSessionIssueResult {
  sessionId: string;
  tokenHash: string;
  expiresAt: Date;
  tokens: TokenPair;
}

export const issueRefreshSessionTokenPair = (payload: JWTPayload): RefreshSessionIssueResult => {
  const sessionId = randomUUID();
  const tokens = generateTokenPair(payload, sessionId);

  return {
    sessionId,
    tokenHash: hashRefreshToken(tokens.refreshToken),
    expiresAt: getRefreshTokenExpiresAt(),
    tokens,
  };
};
