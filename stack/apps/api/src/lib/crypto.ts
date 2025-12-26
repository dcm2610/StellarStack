import { randomBytes, createHash } from "crypto";

export function generateToken(length: number = 32): string {
  return randomBytes(length).toString("hex");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function verifyToken(token: string, hash: string): boolean {
  return hashToken(token) === hash;
}
