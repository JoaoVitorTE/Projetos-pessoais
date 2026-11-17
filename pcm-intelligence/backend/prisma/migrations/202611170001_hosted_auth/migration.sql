ALTER TABLE "User" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "LoginThrottle" (
    "id" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "windowStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LoginThrottle_pkey" PRIMARY KEY ("id")
);
