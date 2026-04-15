-- AlterTable: add tokenVersion column to User for session invalidation on password change
ALTER TABLE "users" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;
