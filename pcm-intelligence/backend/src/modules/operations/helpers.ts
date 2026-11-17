import type { Request, RequestHandler, Response } from "express";
import type { Prisma, RoleName } from "@prisma/client";
import { snapshot } from "./domain.js";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export type Actor = {
  id: string;
  name: string;
  technicianId: string | null;
  role: { name: RoleName };
};
export const actor = (res: Response) => res.locals.user as Actor;
export const run =
  (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
export function requireRole(res: Response, roles: RoleName[]) {
  if (!roles.includes(actor(res).role.name))
    throw new HttpError(403, "Permissão insuficiente");
}
export function must<T>(
  value: T | null | undefined,
  message = "Registro não encontrado",
): T {
  if (!value) throw new HttpError(404, message);
  return value;
}
export function updated(result: { count: number }) {
  if (!result.count)
    throw new HttpError(
      409,
      "O registro foi alterado por outra pessoa. Atualize a tela e tente novamente.",
    );
}
export function audit(
  tx: Prisma.TransactionClient,
  user: Actor,
  action: string,
  entity: string,
  data: unknown,
) {
  return tx.auditLog.create({
    data: { userId: user.id, action, entity, metadata: snapshot(data) },
  });
}
export const pageResponse = (
  items: unknown[],
  total: number,
  page: number,
  limit: number,
) => ({ items, total, page, pages: Math.max(1, Math.ceil(total / limit)) });
