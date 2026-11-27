import type { PrismaClient } from "@prisma/client";
import { formatInTimeZone } from "date-fns-tz";

type FeedCheck = { tab: string; checkedAt: Date; complete: boolean };
type Recurrence = {
  equipmentId: string;
  equipmentName: string;
  equipmentCode: string;
  sector: string;
  total: number;
  recent: { number: string; description: string; date: string }[];
  hasReminder: boolean;
};
type PlanReference = {
  number: string;
  title: string | null;
  orderType: string | null;
  latestOrder: string;
  total: number;
};

export async function sapRoutine(db: PrismaClient, now = new Date()) {
  const localDay = formatInTimeZone(now, "America/Sao_Paulo", "yyyy-MM-dd");
  const since = new Date(localDay + "T00:00:00.000Z");
  since.setUTCDate(since.getUTCDate() - 29);
  const [feeds, recurrence, planReferences] = await Promise.all([
    db.$queryRaw<FeedCheck[]>`
      SELECT DISTINCT ON (sheet->>'tab')
        sheet->>'tab' AS tab, run."updatedAt" AS "checkedAt",
        COALESCE(jsonb_array_length(sheet->'errors'), 0) = 0 AS complete
      FROM "SapWorkbookRun" run
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(run.result->'sheets', '[]'::jsonb)) sheet
      WHERE run."updatedAt" IS NOT NULL
        AND sheet->>'tab' IN ('Ordens', 'Apontamentos')
        AND (sheet->>'processed')::int > 0
      ORDER BY sheet->>'tab', run."updatedAt" DESC, run.id DESC
    `,
    db.$queryRaw<Recurrence[]>`
      WITH corrective AS (
        SELECT sap.number, sap."equipmentId", COALESCE(sap."entryDate", sap."baseDate") AS date,
          COALESCE(sap.fields->>'description', local.description, '') AS description
        FROM "SapOrder" sap
        JOIN "Equipment" equipment ON equipment.id = sap."equipmentId" AND equipment."deletedAt" IS NULL
        LEFT JOIN "MaintenanceOrder" local ON local.id = sap."localOrderId"
        WHERE upper(sap."orderType") IN ('CORR', 'CORI')
          AND COALESCE(sap."entryDate", sap."baseDate") BETWEEN ${since}::date AND ${localDay}::date
          AND (local.status IS NULL OR local.status <> 'CANCELLED')
      ), ranked AS (
        SELECT *, row_number() OVER (PARTITION BY "equipmentId" ORDER BY date DESC, number DESC) AS position
        FROM corrective
      )
      SELECT equipment.id AS "equipmentId", equipment.name AS "equipmentName",
        COALESCE(equipment.tag, equipment."equipmentNumber", equipment.id) AS "equipmentCode",
        sector.name AS sector, count(*)::int AS total,
        jsonb_agg(jsonb_build_object('number', ranked.number, 'description', ranked.description, 'date', ranked.date)
          ORDER BY ranked.position) FILTER (WHERE ranked.position <= 5) AS recent,
        EXISTS (SELECT 1 FROM "MaintenanceReminder" reminder
          WHERE reminder."equipmentId" = equipment.id AND reminder.status = 'PENDING'
            AND reminder.title = 'Investigar recorrência de corretivas') AS "hasReminder"
      FROM ranked
      JOIN "Equipment" equipment ON equipment.id = ranked."equipmentId"
      JOIN "Sector" sector ON sector.id = equipment."sectorId"
      GROUP BY equipment.id, sector.name
      HAVING count(*) >= 2
      ORDER BY total DESC, equipment.id LIMIT 20
    `,
    db.$queryRaw<PlanReference[]>`
      WITH plan_orders AS (
        SELECT number AS "latestOrder", fields->>'planNumber' AS number,
          fields->>'planTitle' AS title, "orderType",
          count(*) OVER (PARTITION BY fields->>'planNumber')::int AS total,
          row_number() OVER (PARTITION BY fields->>'planNumber'
            ORDER BY COALESCE("entryDate", "baseDate") DESC NULLS LAST, number DESC) AS position
        FROM "SapOrder"
        WHERE NULLIF(fields->>'planNumber', '') IS NOT NULL
      )
      SELECT number, title, "orderType", "latestOrder", total FROM plan_orders
      WHERE position = 1 ORDER BY number LIMIT 100
    `,
  ]);
  return {
    day: localDay,
    windowDays: 30,
    feeds: (["IW38", "IW47"] as const).map((code) => {
      const match = feeds.find(
        (feed) => feed.tab === (code === "IW38" ? "Ordens" : "Apontamentos"),
      );
      const checkedToday =
        match &&
        formatInTimeZone(match.checkedAt, "America/Sao_Paulo", "yyyy-MM-dd") ===
          localDay;
      return {
        code,
        label:
          code === "IW38" ? "Ordens de manutenção" : "Apontamentos da equipe",
        checkedAt: match?.checkedAt ?? null,
        status: checkedToday ? (match.complete ? "CURRENT" : "PARTIAL") : "DUE",
      };
    }),
    recurrence,
    planReferences,
  };
}
