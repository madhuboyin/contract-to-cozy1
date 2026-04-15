-- AlterTable: add tokenVersion column to User for session invalidation on password change
ALTER TABLE "User" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;
