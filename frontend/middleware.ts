import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { DEV_BYPASS_AUTH } from "@/lib/dev-auth";
import { isAdmin } from "@/lib/admin-auth";

const middleware = DEV_BYPASS_AUTH
  ? () => NextResponse.next()
  : auth((req) => {
      if (!req.auth) {
        const signInUrl = new URL("/api/auth/signin", req.nextUrl.origin);
        signInUrl.searchParams.set("callbackUrl", req.nextUrl.href);
        return NextResponse.redirect(signInUrl);
      }

      // Admin route protection
      if (req.nextUrl.pathname.startsWith("/app/admin")) {
        const userEmail = req.auth.user?.email;
        if (!isAdmin(userEmail)) {
          // Redirect non-admins to the main app dashboard
          return NextResponse.redirect(new URL("/app", req.nextUrl.origin));
        }
      }

      return NextResponse.next();
    });

export default middleware;

export const config = {
  matcher: ["/app/:path*"]
};
