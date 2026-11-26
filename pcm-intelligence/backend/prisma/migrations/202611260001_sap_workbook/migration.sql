-- CreateTable
CREATE TABLE "SapOrder" (
    "number" TEXT NOT NULL,
    "localOrderId" TEXT,
    "equipmentId" TEXT,
    "noteNumber" TEXT,
    "baseDate" DATE,
    "entryDate" DATE,
    "workCenter" TEXT,
    "orderType" TEXT,
    "fields" JSONB NOT NULL,

    CONSTRAINT "SapOrder_pkey" PRIMARY KEY ("number")
);

-- CreateTable
CREATE TABLE "SapNote" (
    "number" TEXT NOT NULL,
    "orderNumber" TEXT,
    "equipmentId" TEXT,
    "date" DATE,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fields" JSONB NOT NULL,

    CONSTRAINT "SapNote_pkey" PRIMARY KEY ("number")
);

-- CreateTable
CREATE TABLE "SapConfirmation" (
    "key" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "personnelNumber" TEXT NOT NULL,
    "technicianName" TEXT,
    "date" DATE,
    "hours" DECIMAL(24,12),
    "review" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "supersededBy" TEXT,
    "fingerprint" TEXT NOT NULL,
    "groupKey" TEXT NOT NULL,
    "workCenter" TEXT,
    "orderType" TEXT,
    "fields" JSONB NOT NULL,

    CONSTRAINT "SapConfirmation_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "SapWorkbookSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "mapping" JSONB NOT NULL,
    "actorId" TEXT NOT NULL,

    CONSTRAINT "SapWorkbookSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SapWorkbookRun" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "fileId" TEXT,
    "digest" TEXT,
    "revision" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),
    "result" JSONB NOT NULL,

    CONSTRAINT "SapWorkbookRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SapOrder_localOrderId_key" ON "SapOrder"("localOrderId");

-- CreateIndex
CREATE INDEX "SapOrder_noteNumber_idx" ON "SapOrder"("noteNumber");

-- CreateIndex
CREATE INDEX "SapOrder_entryDate_idx" ON "SapOrder"("entryDate");

-- CreateIndex
CREATE INDEX "SapOrder_equipmentId_idx" ON "SapOrder"("equipmentId");

-- CreateIndex
CREATE INDEX "SapNote_orderNumber_idx" ON "SapNote"("orderNumber");

-- CreateIndex
CREATE INDEX "SapNote_equipmentId_idx" ON "SapNote"("equipmentId");

-- CreateIndex
CREATE INDEX "SapConfirmation_orderNumber_idx" ON "SapConfirmation"("orderNumber");

-- CreateIndex
CREATE INDEX "SapConfirmation_date_personnelNumber_idx" ON "SapConfirmation"("date", "personnelNumber");

-- CreateIndex
CREATE INDEX "SapConfirmation_groupKey_idx" ON "SapConfirmation"("groupKey");

-- CreateIndex
CREATE INDEX "SapWorkbookRun_source_receivedAt_idx" ON "SapWorkbookRun"("source", "receivedAt");

-- CreateIndex
CREATE INDEX "SapWorkbookRun_source_fileId_revision_idx" ON "SapWorkbookRun"("source", "fileId", "revision");

-- CreateIndex
CREATE INDEX "MaintenanceOrder_sapReference_idx" ON "MaintenanceOrder"("sapReference");

-- AddForeignKey
ALTER TABLE "SapOrder" ADD CONSTRAINT "SapOrder_localOrderId_fkey" FOREIGN KEY ("localOrderId") REFERENCES "MaintenanceOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SapOrder" ADD CONSTRAINT "SapOrder_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SapNote" ADD CONSTRAINT "SapNote_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
