import { signIn } from "@/auth";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const callbackUrl = req.nextUrl.searchParams.get("callbackUrl") || "/app";
  console.log("[signin/github] Redirecting to GitHub OAuth, callback:", callbackUrl);
  // Use redirect: true for OAuth flow
  return signIn("github", { 
    redirectTo: callbackUrl,
    redirect: true,
  });
}
