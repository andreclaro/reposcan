import { NextResponse } from "next/server";

import { getScannerRegistry } from "@/lib/scanner-registry";

/**
 * Public endpoint to fetch scanner registry.
 * Used by the scan dashboard to show enabled scanners.
 */
export async function GET() {
  try {
    const registry = await getScannerRegistry();
    return NextResponse.json({ scanners: registry });
  } catch (error) {
    console.error("Failed to fetch scanner registry:", error);
    return NextResponse.json(
      { error: "Failed to fetch scanner registry" },
      { status: 502 }
    );
  }
}
