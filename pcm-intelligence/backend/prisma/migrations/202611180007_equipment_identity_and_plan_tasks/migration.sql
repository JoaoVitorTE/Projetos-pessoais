-- AlterTable
ALTER TABLE "Equipment" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "equipmentNumber" TEXT,
ADD COLUMN     "tag" TEXT;

-- AlterTable
ALTER TABLE "MaintenancePlan" ADD COLUMN     "taskListReference" TEXT,
ADD COLUMN     "tasks" JSONB NOT NULL DEFAULT '[]';

-- CreateIndex
CREATE UNIQUE INDEX "Equipment_equipmentNumber_key" ON "Equipment"("equipmentNumber");

-- CreateIndex
CREATE INDEX "Equipment_tag_idx" ON "Equipment"("tag");

-- CreateIndex
CREATE INDEX "Equipment_deletedAt_idx" ON "Equipment"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Equipment_sectorId_tag_key" ON "Equipment"("sectorId", "tag");

