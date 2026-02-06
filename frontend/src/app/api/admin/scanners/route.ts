import { NextResponse } from "next/server";

import { db } from "@/db";
import { scannerSettings } from "@/db/schema";
import { getServerAuth } from "@/lib/server-auth";
import { isAdmin } from "@/lib/admin-auth";
import { getScannerRegistry, getScannerKeys } from "@/lib/scanner-registry";

export async function GET() {
  const session = await getServerAuth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  // Fetch backend registry and DB rows in parallel.
  const [registry, rows] = await Promise.all([
    getScannerRegistry(),
    db.select().from(scannerSettings),
  ]);

  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));

  const scanners = registry.map((meta) => ({
    id: meta.key,
    enabled: byId[meta.key]?.enabled ?? meta.defaultEnabled,
    freeEnabled: byId[meta.key]?.freeEnabled ?? true,
    proEnabled: byId[meta.key]?.proEnabled ?? true,
    customEnabled: byId[meta.key]?.customEnabled ?? true,
    updatedAt: byId[meta.key]?.updatedAt?.toISOString() ?? null,
    name: meta.name,
    tool: meta.tool,
    description: meta.description,
    defaultEnabled: meta.defaultEnabled,
  }));

  return NextResponse.json({ scanners });
}

export async function PATCH(request: Request) {
  const session = await getServerAuth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const validKeys = await getScannerKeys();
  const now = new Date();

  // Legacy: global toggles via { scanners: { [key]: boolean } }
  if (body.scanners && typeof body.scanners === "object") {
    const updates = body.scanners as Record<string, boolean>;
    for (const [key, enabled] of Object.entries(updates)) {
      if (!validKeys.has(key) || typeof enabled !== "boolean") continue;

      await db
        .insert(scannerSettings)
        .values({ id: key, enabled, updatedAt: now })
        .onConflictDoUpdate({
          target: scannerSettings.id,
          set: { enabled, updatedAt: now },
        });
    }
  }

  // Plan access: { planAccess: { [scannerKey]: { free?: bool, pro?: bool, custom?: bool } } }
  if (body.planAccess && typeof body.planAccess === "object") {
    const planUpdates = body.planAccess as Record<
      string,
      { free?: boolean; pro?: boolean; custom?: boolean }
    >;

    for (const [key, access] of Object.entries(planUpdates)) {
      if (!validKeys.has(key) || typeof access !== "object") continue;

      const set: Record<string, boolean | Date> = { updatedAt: now };
      if (typeof access.free === "boolean") set.freeEnabled = access.free;
      if (typeof access.pro === "boolean") set.proEnabled = access.pro;
      if (typeof access.custom === "boolean") set.customEnabled = access.custom;

      await db
        .insert(scannerSettings)
        .values({
          id: key,
          enabled: true,
          freeEnabled: access.free ?? true,
          proEnabled: access.pro ?? true,
          customEnabled: access.custom ?? true,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: scannerSettings.id,
          set,
        });
    }
  }

  return NextResponse.json({ ok: true });
}
