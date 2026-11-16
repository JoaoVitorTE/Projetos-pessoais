import express, { type RequestHandler } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { PrismaClient, type RoleName } from "@prisma/client";
import { compare } from "bcryptjs";
import { randomBytes, createHash } from "node:crypto";
import { z } from "zod";
import pino from "pino";
export const logger = pino();
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export function createApp(db: PrismaClient) {
  const app = express();
  app.disable("x-powered-by");
  const origin = process.env.FRONTEND_ORIGIN || "http://localhost:5173";
  app.use(
    helmet(),
    cors({ origin, credentials: true }),
    express.json({ limit: "32kb" }),
    cookieParser(),
  );
  app.use((req, res, next) => {
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.get("origin") !== origin
    )
      return res.status(403).json({ error: "Origem não autorizada" });
    next();
  });
  app.get("/api/health", async (_req, res, next) => {
    try {
      await db.$queryRaw`SELECT 1`;
      res.json({
        status: "ok",
        database: "connected",
        dataMode: process.env.DATA_MODE,
      });
    } catch (e) {
      next(e);
    }
  });
  const auth: RequestHandler = async (req, res, next) => {
    try {
      const token = req.cookies.pcm_session;
      if (!token)
        return res.status(401).json({ error: "Autenticação necessária" });
      const session = await db.session.findUnique({
        where: { id: digest(token) },
        include: { user: { include: { role: true } } },
      });
      if (!session || session.expiresAt < new Date() || !session.user.active)
        return res.status(401).json({ error: "Sessão inválida" });
      res.locals.user = session.user;
      next();
    } catch (e) {
      next(e);
    }
  };
  const allow =
    (roles: RoleName[]): RequestHandler =>
    (_req, res, next) => {
      if (!roles.includes(res.locals.user.role.name))
        return res.status(403).json({ error: "Permissão insuficiente" });
      next();
    };
  const publicUser = (u: {id: string; name: string; email: string; role: {name: RoleName}}) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role.name,
  });
  app.post(
    "/api/auth/login",
    rateLimit({
      windowMs: 15 * 60000,
      limit: 15,
      standardHeaders: "draft-7",
      legacyHeaders: false,
    }),
    async (req, res, next) => {
      try {
        const body = z
          .object({
            email: z.string().email().max(200),
            password: z.string().min(1).max(128),
          })
          .parse(req.body);
        const user = await db.user.findUnique({
          where: { email: body.email.toLowerCase() },
          include: { role: true },
        });
        const valid = await compare(
          body.password,
          user?.passwordHash ||
            "$2b$12$9Hd2QdR7U7BQYpOw2OdCLuYebL9.PoiNUm2wFnV7QSzvRDwGOV4PC",
        );
        if (!user || !valid || !user.active) {
          await db.auditLog.create({
            data: { action: "LOGIN_FAILED", entity: "Session", metadata: {} },
          });
          return res.status(401).json({ error: "Credenciais inválidas" });
        }
        const token = randomBytes(32).toString("hex");
        await db.$transaction([
          db.session.create({
            data: {
              id: digest(token),
              userId: user.id,
              expiresAt: new Date(Date.now() + 8 * 3600000),
            },
          }),
          db.auditLog.create({
            data: {
              userId: user.id,
              action: "LOGIN",
              entity: "Session",
              metadata: {},
            },
          }),
        ]);
        res.cookie("pcm_session", token, {
          httpOnly: true,
          sameSite: "strict",
          secure: process.env.NODE_ENV === "production",
          maxAge: 8 * 3600000,
          path: "/api",
        });
        res.json(publicUser(user));
      } catch (e) {
        next(e);
      }
    },
  );
  app.get("/api/auth/me", auth, (_req, res) =>
    res.json(publicUser(res.locals.user)),
  );
  app.post("/api/auth/logout", auth, async (req, res, next) => {
    try {
      await db.$transaction([
        db.session.deleteMany({
          where: { id: digest(req.cookies.pcm_session) },
        }),
        db.auditLog.create({
          data: {
            userId: res.locals.user.id,
            action: "LOGOUT",
            entity: "Session",
            metadata: {},
          },
        }),
      ]);
      res.clearCookie("pcm_session", { path: "/api" });
      res.sendStatus(204);
    } catch (e) {
      next(e);
    }
  });
  app.get("/api/foundation", auth, async (_req, res, next) => {
    try {
      const counts = await Promise.all([
        db.equipment.count(),
        db.sector.count(),
        db.technician.count(),
        db.interruption.count(),
        db.maintenanceOrder.count(),
        db.maintenancePlan.count({ where: { type: "PREVENTIVE" } }),
        db.maintenancePlan.count({ where: { type: "LUBRICATION" } }),
        db.thirdPartyService.count(),
        db.compressedAirReading.count(),
      ]);
      res.json({
        dataMode: process.env.DATA_MODE,
        phase: 1,
        counts: Object.fromEntries(
          [
            "equipment",
            "sectors",
            "technicians",
            "interruptions",
            "orders",
            "preventives",
            "lubrications",
            "thirdParties",
            "airReadings",
          ].map((k, i) => [k, counts[i]]),
        ),
      });
    } catch (e) {
      next(e);
    }
  });
  app.get(
    "/api/admin/users",
    auth,
    allow(["ADMIN"]),
    async (_req, res, next) => {
      try {
        const users = await db.user.findMany({ include: { role: true } });
        res.json(users.map(publicUser));
      } catch (e) {
        next(e);
      }
    },
  );
  app.get(
    "/api/audit",
    auth,
    allow(["ADMIN", "MANAGER"]),
    async (_req, res, next) => {
      try {
        res.json(
          await db.auditLog.findMany({
            take: 50,
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              action: true,
              entity: true,
              createdAt: true,
              user: { select: { name: true } },
            },
          }),
        );
      } catch (e) {
        next(e);
      }
    },
  );
  app.use((_req, res) =>
    res.status(404).json({ error: "Recurso não encontrado" }),
  );
  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (error instanceof z.ZodError)
        return res
          .status(400)
          .json({
            error: "Entrada inválida",
            fields: error.flatten().fieldErrors,
          });
      if ((error as {type?: string})?.type === "entity.parse.failed")
        return res.status(400).json({ error: "JSON inválido" });
      logger.error({ err: error }, "Falha na requisição");
      res
        .status(500)
        .json({ error: "Erro interno. Consulte os logs do servidor." });
    },
  );
  return app;
}
