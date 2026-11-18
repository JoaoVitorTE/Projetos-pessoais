import { Router } from "express";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import {
  actor,
  audit,
  HttpError,
  must,
  requireRole,
  run,
  updated,
} from "../operations/helpers.js";
import { date, planners, version } from "../operations/domain.js";
import { ACTIVE, asRange, fits, workIntervals } from "./intervals.js";
import { scheduleLock } from "./lifecycle.js";
const work = z
  .object({
    technicianId: z.string().min(1),
    weekday: z.number().int().min(0).max(6),
    startMinute: z.number().int().min(0).max(1439),
    endMinute: z.number().int().min(1).max(1440),
    active: z.boolean(),
  })
  .strict();
const absence = z
  .object({
    technicianId: z.string().min(1),
    startsAt: date,
    endsAt: date,
    reason: z.string().trim().min(3).max(160),
    active: z.boolean(),
  })
  .strict();
export function configurationRouter(db: PrismaClient) {
  const r = Router();
  r.get(
    "/work-windows",
    run(async (req, res) => {
      const technicianId = z.string().optional().parse(req.query.technicianId);
      res.json(
        await db.technicianWorkWindow.findMany({
          where: { ...(technicianId ? { technicianId } : {}) },
          orderBy: [
            { technicianId: "asc" },
            { weekday: "asc" },
            { startMinute: "asc" },
          ],
          take: 1000,
        }),
      );
    }),
  );
  for (const edit of [false, true])
    r[edit ? "patch" : "post"](
      "/work-windows" + (edit ? "/:id" : ""),
      run(async (req, res) => {
        requireRole(res, planners);
        const parsed = (edit ? work.extend({ version }) : work).parse(req.body),
          { version: expected, ...data } = parsed as z.infer<typeof work> & {
            version?: number;
          };
        if (data.endMinute <= data.startMinute)
          throw new HttpError(
            400,
            "O término da jornada deve ser posterior ao início. Divida turnos noturnos entre os dois dias.",
          );
        const row = await db.$transaction(
          async (tx) => {
            await scheduleLock(tx);
            must(
              await tx.technician.findUnique({
                where: { id: data.technicianId },
              }),
              "Técnico não cadastrado",
            );
            const before = edit
              ? must(
                  await tx.technicianWorkWindow.findUnique({
                    where: { id: req.params.id },
                  }),
                )
              : null;
            if (before && before.technicianId !== data.technicianId)
              throw new HttpError(
                400,
                "Não altere o técnico de uma jornada existente",
              );
            const others = await tx.technicianWorkWindow.findMany({
              where: {
                technicianId: data.technicianId,
                active: true,
                ...(before ? { id: { not: before.id } } : {}),
              },
            });
            if (
              data.active &&
              others.some(
                (w) =>
                  w.weekday === data.weekday &&
                  w.startMinute < data.endMinute &&
                  w.endMinute > data.startMinute,
              )
            )
              throw new HttpError(
                409,
                "Esta jornada se sobrepõe a outra janela do técnico",
              );
            const reservations = await tx.technicianAssignment.findMany({
              where: {
                technicianId: data.technicianId,
                status: { in: ACTIVE },
                endsAt: { gt: new Date() },
              },
            });
            const candidate = [...others, data];
            const blockers = reservations.filter(
              (a) =>
                !fits(
                  asRange(a),
                  workIntervals(candidate, a.startsAt, a.endsAt),
                ),
            );
            if (blockers.length)
              throw new HttpError(
                409,
                "Reprograme as reservas afetadas antes de reduzir a jornada: " +
                  blockers
                    .slice(0, 3)
                    .map((a) => a.id)
                    .join(", "),
              );
            let after;
            if (before) {
              updated(
                await tx.technicianWorkWindow.updateMany({
                  where: { id: before.id, version: expected },
                  data: { ...data, version: { increment: 1 } },
                }),
              );
              after = must(
                await tx.technicianWorkWindow.findUnique({
                  where: { id: before.id },
                }),
              );
            } else after = await tx.technicianWorkWindow.create({ data });
            await audit(
              tx,
              actor(res),
              edit ? "WORK_WINDOW_UPDATED" : "WORK_WINDOW_CREATED",
              "TechnicianWorkWindow",
              { before, after },
            );
            return after;
          },
          { timeout: 25000 },
        );
        res.status(edit ? 200 : 201).json(row);
      }),
    );
  r.get(
    "/absences",
    run(async (req, res) => {
      const f = z
        .object({
          technicianId: z.string().optional(),
          from: z.string().datetime().optional(),
          to: z.string().datetime().optional(),
        })
        .parse(req.query);
      res.json(
        await db.technicianAbsence.findMany({
          where: {
            ...(f.technicianId ? { technicianId: f.technicianId } : {}),
            ...(f.from ? { endsAt: { gt: new Date(f.from) } } : {}),
            ...(f.to ? { startsAt: { lt: new Date(f.to) } } : {}),
          },
          orderBy: { startsAt: "desc" },
          take: 500,
        }),
      );
    }),
  );
  for (const edit of [false, true])
    r[edit ? "patch" : "post"](
      "/absences" + (edit ? "/:id" : ""),
      run(async (req, res) => {
        requireRole(res, planners);
        const parsed = (edit ? absence.extend({ version }) : absence).parse(
            req.body,
          ),
          { version: expected, ...data } = parsed as z.infer<typeof absence> & {
            version?: number;
          };
        if (
          data.endsAt <= data.startsAt ||
          data.endsAt.getTime() - data.startsAt.getTime() > 366 * 86400000
        )
          throw new HttpError(
            400,
            "Indisponibilidade deve ter duração positiva de até 366 dias",
          );
        const row = await db.$transaction(
          async (tx) => {
            await scheduleLock(tx);
            must(
              await tx.technician.findUnique({
                where: { id: data.technicianId },
              }),
            );
            const before = edit
              ? must(
                  await tx.technicianAbsence.findUnique({
                    where: { id: req.params.id },
                  }),
                )
              : null;
            if (before && before.technicianId !== data.technicianId)
              throw new HttpError(
                400,
                "Não altere o técnico de uma indisponibilidade existente",
              );
            if (data.active) {
              const booked = await tx.technicianAssignment.findMany({
                where: {
                  technicianId: data.technicianId,
                  status: { in: ACTIVE },
                  startsAt: { lt: data.endsAt },
                  endsAt: { gt: data.startsAt },
                },
              });
              if (booked.length)
                throw new HttpError(
                  409,
                  "Reprograme ou cancele as reservas afetadas: " +
                    booked
                      .slice(0, 3)
                      .map((a) => a.id)
                      .join(", "),
                );
            }
            let after;
            if (before) {
              updated(
                await tx.technicianAbsence.updateMany({
                  where: { id: before.id, version: expected },
                  data: { ...data, version: { increment: 1 } },
                }),
              );
              after = must(
                await tx.technicianAbsence.findUnique({
                  where: { id: before.id },
                }),
              );
            } else after = await tx.technicianAbsence.create({ data });
            await audit(
              tx,
              actor(res),
              edit
                ? "TECHNICIAN_ABSENCE_UPDATED"
                : "TECHNICIAN_ABSENCE_CREATED",
              "TechnicianAbsence",
              { before, after },
            );
            return after;
          },
          { timeout: 25000 },
        );
        res.status(edit ? 200 : 201).json(row);
      }),
    );
  return r;
}
