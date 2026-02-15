import type { NextAuthConfig } from "next-auth";
import GitHub from "next-auth/providers/github";
import Credentials from "next-auth/providers/credentials";
import { DEV_BYPASS_AUTH, DEV_USER } from "@/lib/dev-auth";

const githubClientId = process.env.AUTH_GITHUB_ID;
const githubClientSecret = process.env.AUTH_GITHUB_SECRET;

const providers = [];

if (githubClientId && githubClientSecret) {
  // Basic provider - only profile and email
  // Public repos don't need authentication - just enter the URL
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

  // Private repos provider - adds repo scope for private repository access
  // Note: GitHub OAuth doesn't have a read-only scope for private repos
  providers.push(
    GitHub({
      id: "github-private",
      name: "GitHub (with Private Repos)",
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
      // Store whether user has private repo access
      if (account?.provider === "github-private") {
        token.hasPrivateRepoAccess = true;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.isEnabled = (token.isEnabled as boolean) ?? true;
        (session.user as { hasPrivateRepoAccess?: boolean }).hasPrivateRepoAccess = token.hasPrivateRepoAccess as boolean;
      }
      return session;
    }
  }
};
