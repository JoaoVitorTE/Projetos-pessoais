import { sapWebhook, workbookRoutes } from "./modules/sap/router.js";
import { sapReportRouter } from "./modules/sap/report.js";
import { experienceRouter } from "./modules/experience/router.js";
import { schedulingRouter } from "./modules/scheduling/router.js";
import express, { type RequestHandler } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import { PrismaClient, type RoleName } from "@prisma/client";
import { compare, hash } from "bcryptjs";
import {
  createOperationsRouter,
  HttpError,
} from "./modules/operations/router.js";
import { importsRouter } from "./modules/imports/router.js";
import { administrationRouter } from "./modules/administration/router.js";
import { intelligenceRouter } from "./modules/intelligence/router.js";
import { allowLogin } from "./services/login-throttle.js";
import { randomBytes, createHash } from "node:crypto";
import { z } from "zod";
import pino from "pino";
export const logger = pino();
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export function createApp(db: PrismaClient) {
  const app = express();
  app.disable("x-powered-by");
  const origins = new Set(
    [
      process.env.FRONTEND_ORIGIN,
      ...(process.env.ADDITIONAL_FRONTEND_ORIGINS || "")
        .split(",")
        .map((v) => v.trim())
        .filter((v) => /^https?:\/\//.test(v)),
      process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : undefined,
      process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
      process.env.NODE_ENV !== "production"
        ? "http://localhost:5173"
        : undefined,
    ].filter((value): value is string => Boolean(value)),
  );
  app.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  app.use(
    helmet(),
    cors({
      origin: (origin, callback) =>
        callback(null, Boolean(origin && origins.has(origin))),
      credentials: true,
    }),
    (req, res, next) => {
      if (
        ["/api/sap/connection", "/api/sap/preview", "/api/sap/import"].includes(
          req.path,
        )
      )
        next();
      else if (req.path === "/api/imports/upload")
        express.json({ limit: "4300kb" })(req, res, next);
      else express.json({ limit: "32kb" })(req, res, next);
    },
    cookieParser(),
  );
  app.use("/api/sap", sapWebhook(db));
  app.use((req, res, next) => {
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      !origins.has(req.get("origin") || "")
    )
      return res.status(403).json({ error: "Origem não autorizada" });
    next();
  });
  app.get("/api/health", async (_req, res, next) => {
    try {
      await db.$queryRaw`SELECT 1`;
      res.json({
        status: "ok",
        version: "0.6.0",
        phase: 3,
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
      if (
        session.user.mustChangePassword &&
        ![
          "/api/auth/me",
          "/api/auth/logout",
          "/api/auth/change-password",
        ].includes(req.path)
      ) {
        return res.status(403).json({
          error: "Troque a senha temporária para continuar",
          code: "PASSWORD_CHANGE_REQUIRED",
        });
      }
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
  const publicUser = (u: {
    id: string;
    name: string;
    email: string;
    role: { name: RoleName };
    mustChangePassword: boolean;
    onboardingVersion: number;
    onboardingCompletedAt: Date | null;
    technicianId: string | null;
  }) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role.name,
    mustChangePassword: u.mustChangePassword,
    technicianId: u.technicianId,
    onboardingVersion: u.onboardingVersion,
    onboardingCompletedAt: u.onboardingCompletedAt,
  });
  app.post("/api/auth/login", async (req, res, next) => {
    try {
      const body = z
        .object({
          email: z.string().trim().email().max(200),
          password: z.string().min(1).max(128),
        })
        .parse(req.body);
      const email = body.email.toLowerCase();
      if (!(await allowLogin(db, email))) {
        return res.status(429).set("Retry-After", "900").json({
          error: "Muitas tentativas. Aguarde 15 minutos para tentar novamente.",
        });
      }
      const user = await db.user.findUnique({
        where: { email },
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
  });
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
  app.post("/api/auth/change-password", auth, async (req, res, next) => {
    try {
      const body = z
        .object({
          currentPassword: z.string().min(1).max(128),
          newPassword: z
            .string()
            .min(12)
            .refine(
              (value) => Buffer.byteLength(value, "utf8") <= 72,
              "Use no máximo 72 bytes",
            ),
        })
        .parse(req.body);
      const user = res.locals.user;
      if (!(await compare(body.currentPassword, user.passwordHash))) {
        return res.status(401).json({ error: "Senha atual incorreta" });
      }
      if (await compare(body.newPassword, user.passwordHash)) {
        return res
          .status(400)
          .json({ error: "A nova senha precisa ser diferente da atual" });
      }
      const passwordHash = await hash(body.newPassword, 12);
      const changed = await db.$transaction(async (tx) => {
        const result = await tx.user.updateMany({
          where: { id: user.id, passwordHash: user.passwordHash },
          data: { passwordHash, mustChangePassword: false },
        });
        if (!result.count) return false;
        await tx.session.deleteMany({ where: { userId: user.id } });
        await tx.auditLog.create({
          data: {
            userId: user.id,
            action: "PASSWORD_CHANGED",
            entity: "User",
            metadata: {},
          },
        });
        return true;
      });
      if (!changed)
        return res
          .status(409)
          .json({ error: "A senha já foi alterada. Entre novamente." });
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
        phase: 3,
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
  const modules = express.Router();
  modules.use(experienceRouter(db));
  modules.use("/scheduling", schedulingRouter(db));
  modules.use("/imports", importsRouter(db));
  modules.use("/sap", workbookRoutes(db));
  modules.use(sapReportRouter(db));
  modules.use("/admin", administrationRouter(db));
  modules.use(intelligenceRouter(db));
  modules.use(createOperationsRouter(db));
  app.use("/api", auth, modules);
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
      if (error instanceof HttpError)
        return res.status(error.status).json({ error: error.message });
      const code = (error as { code?: string })?.code;
      if (code === "P2002")
        return res
          .status(409)
          .json({ error: "Já existe um registro com esse identificador" });
      if (code === "P2003")
        return res
          .status(400)
          .json({ error: "Referência de cadastro inválida" });
      if (code === "P2025")
        return res.status(404).json({ error: "Registro não encontrado" });
      if (error instanceof z.ZodError)
        return res.status(400).json({
          error: "Entrada inválida",
          fields: error.flatten().fieldErrors,
        });
      if ((error as { type?: string })?.type === "entity.too.large")
        return res
          .status(413)
          .json({ error: "Arquivo ou requisição excedeu o limite permitido" });
      if ((error as { type?: string })?.type === "entity.parse.failed")
        return res.status(400).json({ error: "JSON inválido" });
      logger.error({ err: error }, "Falha na requisição");
      res
        .status(500)
        .json({ error: "Erro interno. Consulte os logs do servidor." });
    },
  );
  return app;
}
