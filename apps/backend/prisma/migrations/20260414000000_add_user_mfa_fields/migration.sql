-- Migration: add_user_mfa_fields
-- Adds TOTP-based MFA columns to the users table.
-- mfaEnabled: whether MFA is active for this account (default false).
-- mfaSecret:  AES-256-GCM encrypted TOTP secret (null until setup is completed).

ALTER TABLE "users" ADD COLUMN "mfaEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "mfaSecret" TEXT;
