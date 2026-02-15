import type { NextAuthConfig } from "next-auth";
import GitHub from "next-auth/providers/github";
import Credentials from "next-auth/providers/credentials";
import { DEV_BYPASS_AUTH, DEV_USER } from "@/lib/dev-auth";

const githubClientId = process.env.AUTH_GITHUB_ID;
const githubClientSecret = process.env.AUTH_GITHUB_SECRET;

const providers = [];

if (githubClientId && githubClientSecret) {
  // Basic provider - only profile and email, no repo access
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
      userinfo: "https://api.github.com/user"
    })
  );

  // Public repos only - read-only access to public repositories
  providers.push(
    GitHub({
      id: "github-public",
      name: "GitHub (Public Repos)",
      clientId: githubClientId,
      clientSecret: githubClientSecret,
      authorization: {
        url: "https://github.com/login/oauth/authorize",
        params: {
          scope: "read:user user:email public_repo"
        }
      },
      token: "https://github.com/login/oauth/access_token",
      userinfo: "https://api.github.com/user"
    })
  );

  // Private repos - full repo access (read/write, public and private)
  // Note: GitHub OAuth doesn't have a read-only private repo scope
  providers.push(
    GitHub({
      id: "github-private",
      name: "GitHub (Private Repos)",
      clientId: githubClientId,
      clientSecret: githubClientSecret,
      authorization: {
        url: "https://github.com/login/oauth/authorize",
        params: {
          scope: "read:user user:email repo"
        }
      },
      token: "https://github.com/login/oauth/access_token",
      userinfo: "https://api.github.com/user"
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
    async jwt({ token, user, account }) {
      if (user) {
        token.id = user.id;
        token.isEnabled = (user as { isEnabled?: boolean }).isEnabled ?? true;
      }
      // Store repo access level based on provider used
      if (account?.provider === "github-public") {
        token.repoAccess = "public";
      } else if (account?.provider === "github-private") {
        token.repoAccess = "private";
      } else {
        token.repoAccess = "none";
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.isEnabled = (token.isEnabled as boolean) ?? true;
        (session.user as { repoAccess?: string }).repoAccess = token.repoAccess as string;
      }
      return session;
    }
  }
};
