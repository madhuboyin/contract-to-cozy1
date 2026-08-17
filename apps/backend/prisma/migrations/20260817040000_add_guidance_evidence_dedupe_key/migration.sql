ALTER TABLE "guidance_step_evidences"
ADD COLUMN "dedupeKey" TEXT;

CREATE UNIQUE INDEX "guidance_step_evidences_dedupeKey_key"
ON "guidance_step_evidences"("dedupeKey");
