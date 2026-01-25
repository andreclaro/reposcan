import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { DEV_BYPASS_AUTH } from "@/lib/dev-auth";

const middleware = DEV_BYPASS_AUTH
  ? () => NextResponse.next()
  : auth((req) => {
  if (!req.auth) {
    const signInUrl = new URL("/api/auth/signin", req.nextUrl.origin);
    signInUrl.searchParams.set("callbackUrl", req.nextUrl.href);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
    });

export default middleware;

export const config = {
  matcher: ["/app/:path*"]
};
