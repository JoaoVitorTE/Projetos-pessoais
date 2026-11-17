-- AlterTable
ALTER TABLE "User" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Equipment" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Technician" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "isDemo" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Interruption" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "MaintenanceOrder" ALTER COLUMN "openedAt" DROP NOT NULL,
ALTER COLUMN "scheduledAt" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ImportBatch" ADD COLUMN     "actorId" TEXT,
ADD COLUMN     "counts" JSONB,
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "fileHash" TEXT,
ADD COLUMN     "filename" TEXT,
ADD COLUMN     "mapping" JSONB,
ADD COLUMN     "options" JSONB,
ADD COLUMN     "payload" JSONB,
ADD COLUMN     "preview" JSONB,
ADD COLUMN     "processed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "sourceConfigId" TEXT;

-- CreateTable
CREATE TABLE "ImportSource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "system" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "mapping" JSONB,
    "options" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalRecord" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "externalKey" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "lastApplied" JSONB NOT NULL,
    "appliedVersion" INTEGER NOT NULL,
    "lastBatchId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportChange" (
    "id" TEXT NOT NULL,
    "sequence" SERIAL NOT NULL,
    "batchId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "externalRecordId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "beforeLink" JSONB,
    "undone" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ImportSource_name_key" ON "ImportSource"("name");

-- CreateIndex
CREATE INDEX "ExternalRecord_entityType_entityId_idx" ON "ExternalRecord"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalRecord_scope_entityType_externalKey_key" ON "ExternalRecord"("scope", "entityType", "externalKey");

-- CreateIndex
CREATE UNIQUE INDEX "ImportChange_sequence_key" ON "ImportChange"("sequence");

-- CreateIndex
CREATE INDEX "ImportChange_batchId_sequence_idx" ON "ImportChange"("batchId", "sequence");

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_sourceConfigId_fkey" FOREIGN KEY ("sourceConfigId") REFERENCES "ImportSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalRecord" ADD CONSTRAINT "ExternalRecord_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ImportSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportChange" ADD CONSTRAINT "ImportChange_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImportBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

