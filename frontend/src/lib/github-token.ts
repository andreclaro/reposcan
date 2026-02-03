import { getDb } from "@/db";
import { accounts } from "@/db/schema";
import { eq, and } from "drizzle-orm";

/**
 * Get the GitHub access token for a user from their OAuth account.
 * Returns null if the user doesn't have a GitHub account linked or token is missing.
 */
export async function getUserGitHubToken(userId: string): Promise<string | null> {
  const db = getDb();
  
  const account = await db
    .select({
      accessToken: accounts.access_token,
    })
    .from(accounts)
    .where(
      and(
        eq(accounts.userId, userId),
        eq(accounts.provider, "github")
      )
    )
    .limit(1);

  if (account.length === 0 || !account[0].accessToken) {
    return null;
  }

  return account[0].accessToken;
}
