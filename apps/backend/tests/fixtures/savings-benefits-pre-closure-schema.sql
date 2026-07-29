CREATE TYPE "RecurrenceFrequency" AS ENUM (
  'MONTHLY',
  'QUARTERLY',
  'SEMI_ANNUALLY',
  'ANNUALLY'
);

CREATE TABLE "hidden_asset_sources" (
  "id" TEXT PRIMARY KEY
);

CREATE TABLE "hidden_asset_programs" (
  "id" TEXT PRIMARY KEY
);

CREATE TABLE "savings_benefit_partners" (
  "id" TEXT PRIMARY KEY
);

CREATE TABLE "savings_benefit_actions" (
  "id" TEXT PRIMARY KEY
);

CREATE TABLE "property_maintenance_tasks" (
  "id" TEXT PRIMARY KEY
);

CREATE TABLE "property_habits" (
  "id" TEXT PRIMARY KEY
);
