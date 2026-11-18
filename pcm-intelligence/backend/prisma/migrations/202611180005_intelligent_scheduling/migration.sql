-- DropForeignKey
ALTER TABLE "TechnicianAssignment" DROP CONSTRAINT "TechnicianAssignment_orderId_fkey";

-- AlterTable
ALTER TABLE "TechnicianAssignment" ADD COLUMN     "actualStartedAt" TIMESTAMP(3),
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "planId" TEXT,
ADD COLUMN     "scheduledFor" TIMESTAMP(3),
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1,
ALTER COLUMN "orderId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "TechnicianWorkWindow" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "technicianId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "TechnicianWorkWindow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TechnicianAbsence" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "technicianId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "TechnicianAbsence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssignmentHistory" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB NOT NULL,
    "notes" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssignmentHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TechnicianWorkWindow_technicianId_weekday_idx" ON "TechnicianWorkWindow"("technicianId", "weekday");

-- CreateIndex
CREATE INDEX "TechnicianAbsence_technicianId_startsAt_endsAt_idx" ON "TechnicianAbsence"("technicianId", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "AssignmentHistory_assignmentId_createdAt_idx" ON "AssignmentHistory"("assignmentId", "createdAt");

-- CreateIndex
CREATE INDEX "TechnicianAssignment_orderId_status_idx" ON "TechnicianAssignment"("orderId", "status");

-- CreateIndex
CREATE INDEX "TechnicianAssignment_planId_status_idx" ON "TechnicianAssignment"("planId", "status");

-- CreateIndex
CREATE INDEX "TechnicianAssignment_startsAt_endsAt_idx" ON "TechnicianAssignment"("startsAt", "endsAt");

-- AddForeignKey
ALTER TABLE "TechnicianAssignment" ADD CONSTRAINT "TechnicianAssignment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "MaintenanceOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechnicianAssignment" ADD CONSTRAINT "TechnicianAssignment_planId_fkey" FOREIGN KEY ("planId") REFERENCES "MaintenancePlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechnicianWorkWindow" ADD CONSTRAINT "TechnicianWorkWindow_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "Technician"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechnicianAbsence" ADD CONSTRAINT "TechnicianAbsence_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "Technician"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentHistory" ADD CONSTRAINT "AssignmentHistory_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "TechnicianAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentHistory" ADD CONSTRAINT "AssignmentHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Invariantes de domínio, inclusive quando um cliente grava fora da API.
ALTER TABLE "TechnicianAssignment" ADD CONSTRAINT "assignment_target_check" CHECK (
 ("orderId" IS NOT NULL AND "planId" IS NULL AND "scheduledFor" IS NULL) OR
 ("orderId" IS NULL AND "planId" IS NOT NULL AND "scheduledFor" IS NOT NULL)
);
ALTER TABLE "TechnicianAssignment" ADD CONSTRAINT "assignment_interval_check" CHECK ("endsAt" > "startsAt" AND "endsAt" <= "startsAt" + interval '24 hours');
ALTER TABLE "TechnicianAssignment" ADD CONSTRAINT "assignment_status_check" CHECK (status IN ('SCHEDULED','IN_PROGRESS','BLOCKED','COMPLETED','CANCELLED'));
ALTER TABLE "TechnicianWorkWindow" ADD CONSTRAINT "work_window_check" CHECK (weekday BETWEEN 0 AND 6 AND "startMinute" >= 0 AND "endMinute" <= 1440 AND "endMinute" > "startMinute");
ALTER TABLE "TechnicianAbsence" ADD CONSTRAINT "absence_interval_check" CHECK ("endsAt" > "startsAt");
