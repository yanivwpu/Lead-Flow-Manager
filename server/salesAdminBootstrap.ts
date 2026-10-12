import bcrypt from "bcryptjs";
import { db } from "../drizzle/db";
import { adminSettings } from "@shared/schema";
import { validateNewPassword } from "./passwordPolicy";

/** Operator-only initialization. A conflict must never replace existing credentials. */
export async function initializeSalesAdmin(password: unknown): Promise<boolean> {
  const error = validateNewPassword(password);
  if (error) throw new Error(error);
  const hash = await bcrypt.hash(password as string, 10);
  const created = await db.insert(adminSettings)
    .values({ id: "admin", passwordHash: hash, updatedAt: new Date() })
    .onConflictDoNothing({ target: adminSettings.id })
    .returning({ id: adminSettings.id });
  return created.length === 1;
}
