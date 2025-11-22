-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('REPAIR_SERVICE', 'PROPERTY_TAX', 'HOA_FEE', 'UTILITY', 'APPLIANCE', 'MATERIALS', 'OTHER');

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "policyId" TEXT,
ADD COLUMN     "propertyId" TEXT,
ADD COLUMN     "warrantyId" TEXT;

-- CreateTable
CREATE TABLE "warranties" (
    "id" TEXT NOT NULL,
    "homeownerProfileId" TEXT NOT NULL,
    "propertyId" TEXT,
    "providerName" TEXT NOT NULL,
    "policyNumber" TEXT,
    "coverageDetails" TEXT,
    "cost" DECIMAL(12,2),
    "startDate" TIMESTAMP(3) NOT NULL,
    "expiryDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warranties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insurance_policies" (
    "id" TEXT NOT NULL,
    "homeownerProfileId" TEXT NOT NULL,
    "propertyId" TEXT,
    "carrierName" TEXT NOT NULL,
    "policyNumber" TEXT NOT NULL,
    "coverageType" TEXT,
    "premiumAmount" DECIMAL(12,2) NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "expiryDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "insurance_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" TEXT NOT NULL,
    "homeownerProfileId" TEXT NOT NULL,
    "propertyId" TEXT,
    "bookingId" TEXT,
    "description" TEXT NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "warranties_homeownerProfileId_idx" ON "warranties"("homeownerProfileId");

-- CreateIndex
CREATE INDEX "warranties_expiryDate_idx" ON "warranties"("expiryDate");

-- CreateIndex
CREATE INDEX "insurance_policies_homeownerProfileId_idx" ON "insurance_policies"("homeownerProfileId");

-- CreateIndex
CREATE INDEX "insurance_policies_expiryDate_idx" ON "insurance_policies"("expiryDate");

-- CreateIndex
CREATE INDEX "expenses_homeownerProfileId_idx" ON "expenses"("homeownerProfileId");

-- CreateIndex
CREATE INDEX "expenses_category_idx" ON "expenses"("category");

-- CreateIndex
CREATE INDEX "expenses_transactionDate_idx" ON "expenses"("transactionDate");

-- CreateIndex
CREATE INDEX "documents_propertyId_idx" ON "documents"("propertyId");

-- CreateIndex
CREATE INDEX "documents_warrantyId_idx" ON "documents"("warrantyId");

-- CreateIndex
CREATE INDEX "documents_policyId_idx" ON "documents"("policyId");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_warrantyId_fkey" FOREIGN KEY ("warrantyId") REFERENCES "warranties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "insurance_policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_homeownerProfileId_fkey" FOREIGN KEY ("homeownerProfileId") REFERENCES "homeowner_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_policies" ADD CONSTRAINT "insurance_policies_homeownerProfileId_fkey" FOREIGN KEY ("homeownerProfileId") REFERENCES "homeowner_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_policies" ADD CONSTRAINT "insurance_policies_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_homeownerProfileId_fkey" FOREIGN KEY ("homeownerProfileId") REFERENCES "homeowner_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
