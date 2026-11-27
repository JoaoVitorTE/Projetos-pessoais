import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { snapshot } from "../operations/domain.js";
import { HttpError } from "../operations/helpers.js";

type Field = "preview" | "payload";

function encryptionKey() {
  const configured = process.env.PCM_IMPORT_ENCRYPTION_KEY;
  if (!configured) return undefined;
  if (!/^[a-f0-9]{64}$/i.test(configured))
    throw new Error("Configuração da chave de importação inválida");
  return Buffer.from(configured, "hex");
}

export function protectImportJson(
  value: unknown,
  field: Field,
): Prisma.InputJsonValue {
  const key = encryptionKey();
  if (!key) {
    if (process.env.DATA_MODE === "operational")
      throw new HttpError(
        503,
        "A proteção das importações precisa ser configurada.",
      );
    return snapshot(value);
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from("pcm:import:" + field));
  const text = Buffer.concat([
    cipher.update(JSON.stringify(value)),
    cipher.final(),
  ]);
  return {
    sealed: "aes-256-gcm-v1",
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    text: text.toString("base64"),
  };
}

export function readImportJson(value: Prisma.JsonValue, field: Field): unknown {
  // Batches already in progress before key configuration remain readable.
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    value.sealed !== "aes-256-gcm-v1"
  )
    return value;
  const key = encryptionKey();
  if (!key)
    throw new HttpError(
      503,
      "A proteção das importações precisa ser configurada.",
    );
  if (
    typeof value.iv !== "string" ||
    typeof value.tag !== "string" ||
    typeof value.text !== "string"
  )
    throw new Error("Conteúdo cifrado inválido");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(value.iv, "base64"),
  );
  decipher.setAAD(Buffer.from("pcm:import:" + field));
  decipher.setAuthTag(Buffer.from(value.tag, "base64"));
  const text = Buffer.concat([
    decipher.update(Buffer.from(value.text, "base64")),
    decipher.final(),
  ]);
  return JSON.parse(text.toString("utf8"));
}
