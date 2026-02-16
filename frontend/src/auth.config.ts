import type { NextAuthConfig } from "next-auth";
import GitHub from "next-auth/providers/github";
import Credentials from "next-auth/providers/credentials";
import { DEV_BYPASS_AUTH, DEV_USER } from "@/lib/dev-auth";

const githubClientId = process.env.AUTH_GITHUB_ID;
const githubClientSecret = process.env.AUTH_GITHUB_SECRET;

const providers = [];

if (githubClientId && githubClientSecret) {
  // Login with minimal permissions - NO repository access
  // Public repos don't need authentication
  // Private repos handled via GITHUB_TOKEN (user adds in settings)
  providers.push(
    GitHub({
      id: "github",
      name: "GitHub",
      clientId: githubClientId,
      clientSecret: githubClientSecret,
      authorization: {
        url: "https://github.com/login/oauth/authorize",
        params: {
          scope: "read:user user:email"
        }
      },
      token: "https://github.com/login/oauth/access_token",
      userinfo: {
        url: "https://api.github.com/user",
        async request({ tokens, provider }: { tokens: { access_token?: string }; provider: { userinfo?: { url?: string } } }) {
          const profile = await fetch(provider.userinfo?.url as string, {
            headers: {
              Authorization: `Bearer ${tokens.access_token}`,
              "User-Agent": "authjs"
            }
          }).then(async (res) => await res.json());

          // If email is not public, fetch from /user/emails endpoint
          if (!profile.email) {
            const emails = await fetch("https://api.github.com/user/emails", {
              headers: {
                Authorization: `Bearer ${tokens.access_token}`,
                "User-Agent": "authjs"
              }
            }).then(async (res) => await res.json());

            if (Array.isArray(emails) && emails.length > 0) {
              // Find primary email, or fall back to first verified, or first available
              const primaryEmail = emails.find((e: { primary: boolean; email: string }) => e.primary)?.email
                || emails.find((e: { verified: boolean; email: string }) => e.verified)?.email
                || emails[0]?.email;
              profile.email = primaryEmail;
            }
          }

          return profile;
        }
      }
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

export const authConfig: NextAuthConfig = {
  secret: process.env.AUTH_SECRET,
  trustHost: true,
  cookies: {
    sessionToken: {
      name: process.env.NODE_ENV === "production" ? "__Secure-authjs.session-token" : "authjs.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
    callbackUrl: {
      name: process.env.NODE_ENV === "production" ? "__Secure-authjs.callback-url" : "authjs.callback-url",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
    csrfToken: {
      name: process.env.NODE_ENV === "production" ? "__Secure-authjs.csrf-token" : "authjs.csrf-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
  providers,
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60
  },
  jwt: {
    maxAge: 30 * 24 * 60 * 60
  },
  pages: {
    signIn: "/login",
    error: "/login"
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.isEnabled = (user as { isEnabled?: boolean }).isEnabled ?? true;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.isEnabled = (token.isEnabled as boolean) ?? true;
      }
      return session;
    }
  }
};
