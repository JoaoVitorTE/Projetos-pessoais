-- AlterTable
ALTER TABLE "User" ADD COLUMN     "technicianId" TEXT;

-- AlterTable
ALTER TABLE "Interruption" ALTER COLUMN "endedAt" DROP NOT NULL,
ALTER COLUMN "durationMinutes" DROP NOT NULL;

-- AlterTable
ALTER TABLE "MaintenanceOrder" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "MaintenancePlan" ADD COLUMN     "title" TEXT NOT NULL DEFAULT 'Plano de manutenção',
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "MaintenanceExecution" ADD COLUMN     "scheduledFor" TIMESTAMP(3),
ADD COLUMN     "technicianName" TEXT;

-- AlterTable
ALTER TABLE "ThirdPartyService" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "ThirdPartyDocument" ADD COLUMN     "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "requirementId" TEXT,
ADD COLUMN     "verified" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "OrderHistory" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderHistory_orderId_createdAt_idx" ON "OrderHistory"("orderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_technicianId_key" ON "User"("technicianId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "Technician"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThirdPartyDocument" ADD CONSTRAINT "ThirdPartyDocument_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "DocumentRequirement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderHistory" ADD CONSTRAINT "OrderHistory_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "MaintenanceOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderHistory" ADD CONSTRAINT "OrderHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Vinculação explícita somente da conta fictícia; não altera senhas ou permissões.
UPDATE "User" SET "technicianId" = 'TEC-1'
WHERE email = 'technician@pcm.demo' AND "technicianId" IS NULL
AND EXISTS (SELECT 1 FROM "Technician" WHERE id = 'TEC-1');
