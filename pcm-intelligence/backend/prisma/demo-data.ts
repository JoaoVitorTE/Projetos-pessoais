// Uma única fonte de dados fictícios para o seed Prisma e a inicialização remota.
export function createDemoData(now = new Date()) {
  const days = (n: number) => new Date(now.getTime() + n * 86400000);
  const equipmentId = (n: number) => `EQ-${String(n).padStart(3, "0")}`;
  const orderId = (n: number) => `OS-${String(n).padStart(4, "0")}`;
  const sectors = Array.from({ length: 5 }, (_, i) => ({
    id: `SEC-${i + 1}`,
    name: ["Usinagem", "Montagem", "Estamparia", "Pintura", "Utilidades"][i],
  }));
  const equipment = Array.from({ length: 30 }, (_, index) => {
    const i = index + 1;
    return {
      id: equipmentId(i),
      name: `${["Centro de usinagem", "Prensa", "Transportador", "Cabine", "Compressor"][index % 5]} ${i}`,
      sectorId: `SEC-${(index % 5) + 1}`,
      criticality: (i % 3) + 1,
      status: i % 7 === 0 ? "STOPPED" : "RUNNING",
      isDemo: true,
    };
  });
  const technicians = Array.from({ length: 12 }, (_, i) => ({
    id: `TEC-${i + 1}`,
    name: `Técnico fictício ${i + 1}`,
    specialty: (i + 1) % 2 ? "Mecânica" : "Elétrica",
  }));
  const interruptions = Array.from({ length: 200 }, (_, index) => {
    const i = index + 1,
      startedAt = days(i > 140 ? -((i % 7) + 1) : -((i % 49) + 8));
    startedAt.setUTCHours(i % 24, 0, 0, 0);
    const durationMinutes = 20 + ((i * 17) % 160);
    return {
      id: `INT-${i}`,
      equipmentId: i > 140 ? "EQ-014" : equipmentId((i % 30) + 1),
      startedAt,
      endedAt: new Date(startedAt.getTime() + durationMinutes * 60000),
      durationMinutes,
      type: "UNPLANNED",
      reason: ["Inspeção necessária", "Falha registrada", "Ajuste operacional"][
        i % 3
      ],
      description: "Ocorrência fictícia para demonstração",
      source: "DEMO",
      status: "CLOSED",
      isDemo: true,
    };
  });
  const orders = Array.from({ length: 100 }, (_, index) => {
    const i = index + 1;
    return {
      id: orderId(i),
      equipmentId: equipmentId((i % 30) + 1),
      technicianId: `TEC-${(i % 12) + 1}`,
      type: [
        "CORRECTIVE",
        "PREVENTIVE",
        "PREDICTIVE",
        "LUBRICATION",
        "INSPECTION",
      ][i % 5],
      description: `Atividade fictícia ${i}: inspeção e manutenção`,
      priority: (i % 3) + 1,
      status: [
        "OPEN",
        "ANALYSIS",
        "SCHEDULED",
        "IN_PROGRESS",
        "WAITING_PART",
        "WAITING_VENDOR",
        "COMPLETED",
        "CANCELLED",
      ][i % 8],
      openedAt: days(-30),
      scheduledAt: i % 8 === 6 ? days(-2) : days((i % 20) - 10),
      completedAt: i % 8 === 6 ? days(-1) : null,
      isDemo: true,
    };
  });
  const plans = Array.from({ length: 70 }, (_, index) => {
    const i = index + 1;
    return {
      id: `PLAN-${i}`,
      equipmentId: equipmentId((i % 30) + 1),
      technicianId: `TEC-${(i % 12) + 1}`,
      type: i <= 40 ? "PREVENTIVE" : "LUBRICATION",
      intervalDays: i <= 40 ? 30 : 7,
      nextExecution: days((i % 21) - 5),
      active: true,
      isDemo: true,
    };
  });
  const services = Array.from({ length: 25 }, (_, index) => {
    const i = index + 1;
    return {
      id: `TER-${i}`,
      provider: `Prestador fictício ${(i % 6) + 1}`,
      description: `Serviço de manutenção demonstrativo ${i}`,
      executedAt: days(-20),
      internalOwner: "Responsável fictício PCM",
      orderId: orderId(i),
      status: [
        "REQUESTED",
        "EXECUTED",
        "DOCUMENTS_RECEIVED",
        "CHECKING",
        "PENDING",
        "PREPARED",
        "VALIDATED",
        "SENT_TO_CENTRAL",
        "FINANCE",
        "FINISHED",
      ][i % 10],
      pendingNotes:
        i % 10 === 4 ? "Requisito a definir pelo administrador" : null,
      stageEnteredAt: days(-(i % 15)),
      isDemo: true,
    };
  });
  const movements = services.map((service) => ({
    id: `MOV-${service.id}`,
    serviceId: service.id,
    status: service.status,
    occurredAt: service.stageEnteredAt,
    actor: "Seed de demonstração",
    notes: "Estado inicial fictício",
  }));
  const readings = Array.from({ length: 336 }, (_, i) => ({
    id: `AIR-${i}`,
    compressor: `COMP-${(i % 2) + 1}`,
    sector: "Utilidades",
    pressure: 6.5 + (i % 8) / 10,
    flow: 110 + (i % 17) * 3,
    energyKwh: 18 + (i % 9),
    measuredAt: new Date(now.getTime() - i * 3600000),
    operatingState: "RUNNING",
    isDemo: true,
  }));
  return {
    sectors,
    equipment: equipment.map((e) => ({ ...e, tag: e.id })),
    technicians,
    interruptions,
    orders,
    plans,
    services,
    movements,
    readings,
  };
}
