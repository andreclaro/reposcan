import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import { DrizzleAdapter } from "@auth/drizzle-adapter";

import { getDb } from "@/db";
import { accounts, sessions, users, verificationTokens } from "@/db/schema";
import { DEV_BYPASS_AUTH, DEV_USER } from "@/lib/dev-auth";

const githubClientId = process.env.AUTH_GITHUB_ID || process.env.GITHUB_CLIENT_ID;
const githubClientSecret = process.env.AUTH_GITHUB_SECRET || process.env.GITHUB_CLIENT_SECRET;
const authSecret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
const isBuild = process.env.NEXT_PHASE === "phase-production-build";

console.log("[auth config] GITHUB_CLIENT_ID:", githubClientId ? `${githubClientId.slice(0, 8)}...` : "NOT SET");
console.log("[auth config] GITHUB_CLIENT_SECRET:", githubClientSecret ? "SET" : "NOT SET");
console.log("[auth config] AUTH_SECRET:", authSecret ? "SET" : "NOT SET");
console.log("[auth config] DEV_BYPASS_AUTH:", DEV_BYPASS_AUTH);

if ((!githubClientId || !githubClientSecret) && !DEV_BYPASS_AUTH && !isBuild) {
  throw new Error("GitHub OAuth credentials are not set");
}

const providers = [];

if (githubClientId && githubClientSecret) {
  providers.push(
    GitHub({
      clientId: githubClientId,
      clientSecret: githubClientSecret,
      // Disable PKCE for GitHub (it's optional for GitHub OAuth)
      // Disable state check for now (state cookie parsing issue)
      // checks: ["state"],
    })
  );
} else if (isBuild) {
  providers.push(
    GitHub({
      clientId: "build-placeholder",
      clientSecret: "build-placeholder"
    })
  );
}

if (DEV_BYPASS_AUTH) {
  providers.push(
    Credentials({
      name: "Dev Mode",
      credentials: {},
      authorize: async () => DEV_USER
    })
  );
}

console.log("[auth config] providers count:", providers.length);

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: authSecret,
  trustHost: true,
  adapter: DrizzleAdapter(getDb(), {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers,
  session: {
    strategy: "database"
  },
  cookies: {
    state: {
      name: "authjs.state",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: false,
        maxAge: 900,
      },
    },
  },
  callbacks: {
    session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    }
  }
});
