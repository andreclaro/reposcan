import type { Session } from "next-auth";

import { auth as nextAuth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { DEV_BYPASS_AUTH, DEV_USER } from "@/lib/dev-auth";

const DEV_SESSION_TTL_MS = 1000 * 60 * 60 * 24;

async function ensureDevUser() {
  if (!DEV_BYPASS_AUTH) {
    return;
  }

  await db
    .insert(users)
    .values({
      id: DEV_USER.id,
      name: DEV_USER.name,
      email: DEV_USER.email,
      image: DEV_USER.image
    })
    .onConflictDoNothing();
}

export async function getServerAuth(): Promise<Session | null> {
  if (!DEV_BYPASS_AUTH) {
    return nextAuth();
  }

  const liveSession = await nextAuth();
  if (liveSession?.user?.id) {
    return liveSession;
  }

  await ensureDevUser();

  return {
    user: {
      id: DEV_USER.id,
      name: DEV_USER.name,
      email: DEV_USER.email,
      image: DEV_USER.image
    },
    expires: new Date(Date.now() + DEV_SESSION_TTL_MS).toISOString()
  };
}
