CREATE TABLE "MaintenanceReminder" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "plannedFor" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "sapReference" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    CONSTRAINT "MaintenanceReminder_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MaintenanceReminder_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "MaintenanceReminder_status_plannedFor_idx" ON "MaintenanceReminder"("status", "plannedFor");
CREATE INDEX "MaintenanceReminder_equipmentId_idx" ON "MaintenanceReminder"("equipmentId");
ALTER TABLE "MaintenanceReminder" ENABLE ROW LEVEL SECURITY;
