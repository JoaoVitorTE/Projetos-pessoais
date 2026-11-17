-- Processos solicitados podem aguardar execução; não se inventa uma data passada.
ALTER TABLE "ThirdPartyService" ALTER COLUMN "executedAt" DROP NOT NULL;
