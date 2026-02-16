import NextAuth from "next-auth";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { accounts, sessions, users, verificationTokens } from "@/db/schema";
import { DEV_BYPASS_AUTH } from "@/lib/dev-auth";
import { getAdminEmails, isAdmin } from "@/lib/admin-auth";
import { authConfig } from "@/auth.config";
import { sendEmail } from "@/lib/email";
import { buildNewUserPendingApprovalEmail } from "@/lib/email-templates/new-user-pending-approval";
import { logger } from "@/lib/logger.server";

const BETA_MODE_ENABLED = process.env.NEXT_PUBLIC_BETA_MODE_ENABLED === "true";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(getDb(), {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account, profile }) {
      // Allow dev bypass and credentials provider without checks
      if (account?.provider === "credentials" && DEV_BYPASS_AUTH) {
        return true;
      }

      const db = getDb();
      const userEmail = user.email;

      console.log("[auth] signIn callback:", { 
        provider: account?.provider, 
        hasEmail: !!userEmail,
        email: userEmail ? `${userEmail.substring(0, 3)}...` : null,
        hasProfile: !!profile,
        userName: user.name
      });

      if (!userEmail) {
        console.log("[auth] signIn rejected: no email");
        return "/login?error=EmailRequired";
      }

      // Check if admin (admins are always allowed)
      if (isAdmin(userEmail)) {
        console.log("[auth] signIn allowed: admin user");
        return true;
      }

      // Check if user exists and is enabled
      const existingUser = await db
        .select({ isEnabled: users.isEnabled, id: users.id })
        .from(users)
        .where(eq(users.email, userEmail))
        .limit(1);

      if (existingUser.length > 0) {
        // User exists - check if enabled
        if (!existingUser[0].isEnabled) {
          console.log("[auth] signIn rejected: user account is disabled");
          return `/login?error=AccountDisabled`;
        }
        
        // If OAuth account was deleted (e.g., via debug endpoint), 
        // we need to link it back to the existing user
        if (account && profile) {
          const existingAccount = await db.query.accounts.findFirst({
            where: and(
              eq(accounts.provider, account.provider),
              eq(accounts.providerAccountId, account.providerAccountId)
            )
          });
          
          if (!existingAccount) {
            console.log("[auth] Linking OAuth account to existing user:", existingUser[0].id);
            // The adapter will handle creating the account link
          }
        }
        
        console.log("[auth] signIn allowed: existing enabled user");
        return true;
      }

      // New user - in beta mode, new accounts are disabled by default
      if (BETA_MODE_ENABLED) {
        console.log("[auth] signIn: new user in beta mode, account will be created disabled");
        user.isEnabled = false;
        return true;
      }

      console.log("[auth] signIn allowed: new user (beta mode disabled)");
      return true;
    },
  },
  events: {
    async createUser({ user }) {
      // Ensure new users have correct isEnabled value based on beta mode
      if (BETA_MODE_ENABLED && user.email && user.id && !isAdmin(user.email)) {
        const db = getDb();
        await db
          .update(users)
          .set({ isEnabled: false })
          .where(eq(users.id, user.id));
        logger.info("[auth] New user created with isEnabled=false (beta mode)", {
          email: user.email,
          userId: user.id,
        });

        // Notify admins so they can enable the user
        const adminEmails = getAdminEmails();
        if (adminEmails.length > 0) {
          const { subject, html } = buildNewUserPendingApprovalEmail({
            userName: user.name ?? null,
            userEmail: user.email,
          });
          for (const adminEmail of adminEmails) {
            const result = await sendEmail({ to: adminEmail, subject, html });
            if ("skipped" in result) {
              logger.warn("[auth] Admin notification skipped", {
                to: adminEmail,
                reason: result.reason,
              });
            } else if (result.success) {
              logger.info("[auth] Admin notification sent for new user", {
                to: adminEmail,
                newUserEmail: user.email,
              });
            } else {
              logger.error("[auth] Admin notification failed", {
                to: adminEmail,
                error: result.error,
              });
            }
          }
        }
      }
    }
  }
});
