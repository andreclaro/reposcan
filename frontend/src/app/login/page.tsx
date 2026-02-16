"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertCircle, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { DEV_BYPASS_AUTH } from "@/lib/dev-auth";
import { GitHubSignInButton } from "@/components/auth/signin-button";

// Error messages for different error codes
const ERROR_MESSAGES: Record<string, { title: string; message: string; type: "error" | "warning" | "info" }> = {
  AccountDisabled: {
    title: "Account Pending Approval",
    message: "Your account has been created but is pending admin approval. You'll receive an email once your account is activated.",
    type: "warning"
  },
  AccessDenied: {
    title: "Access Denied",
    message: "You don't have permission to access this resource. Please contact support if you believe this is an error.",
    type: "error"
  },
  OAuthAccountNotLinked: {
    title: "Account Connection Issue",
    message: "Your GitHub account was disconnected. Please click the link below to reset your account.",
    type: "warning"
  },
  EmailRequired: {
    title: "Email Access Required",
    message: "We need access to your email address to create your account. Please ensure your GitHub email is verified and try again.",
    type: "warning"
  },
  Configuration: {
    title: "Configuration Error",
    message: "There's a problem with the server configuration. Please try again later.",
    type: "error"
  },
  Default: {
    title: "Authentication Error",
    message: "An error occurred during authentication. Please try again.",
    type: "error"
  }
};

function LoginForm() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error") || undefined;
  const callbackUrl = searchParams.get("callbackUrl") || undefined;

  const errorInfo = error ? (ERROR_MESSAGES[error] || ERROR_MESSAGES.Default) : null;

  return (
    <div className="w-full max-w-md space-y-6">
      {/* Logo */}
      <div className="text-center">
        <Link href="/" className="inline-flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900">
            <svg
              className="h-6 w-6 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
              />
            </svg>
          </div>
          <span className="text-xl font-semibold text-slate-900">SecureFast</span>
        </Link>
      </div>

      {/* Error Alert */}
      {errorInfo && (
        <Alert variant={errorInfo.type === "error" ? "destructive" : "default"}>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{errorInfo.title}</AlertTitle>
          <AlertDescription>
            {errorInfo.message}
            {error === "OAuthAccountNotLinked" && (
              <div className="mt-2">
                <a href="/reset" className="text-blue-600 hover:underline font-medium">
                  Click here to reset your account →
                </a>
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Success message for beta mode */}
      {error === "AccountDisabled" && (
        <Alert className="bg-blue-50 border-blue-200">
          <CheckCircle2 className="h-4 w-4 text-blue-600" />
          <AlertTitle className="text-blue-900">Beta Access</AlertTitle>
          <AlertDescription className="text-blue-800">
            We&apos;re currently in beta. New accounts require admin approval before accessing the service.
          </AlertDescription>
        </Alert>
      )}

      {/* Login Card */}
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Welcome back</CardTitle>
          <CardDescription>
            Sign in to access your security dashboard
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* GitHub Sign In */}
          <GitHubSignInButton callbackUrl={callbackUrl || "/app"} />

          {/* Dev Bypass */}
          {DEV_BYPASS_AUTH && (
            <Button
              asChild
              variant="outline"
              className="w-full h-11"
              size="lg"
            >
              <Link href="/app">Continue in dev mode</Link>
            </Button>
          )}

          <p className="text-center text-sm text-muted-foreground">
            By signing in, you agree to our{" "}
            <Link href="/terms" className="underline hover:text-primary">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="underline hover:text-primary">
              Privacy Policy
            </Link>
          </p>
        </CardContent>
      </Card>

      {/* Back to home */}
      <p className="text-center text-sm text-muted-foreground">
        <Link href="/" className="underline hover:text-primary">
          ← Back to home
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <Suspense fallback={<div className="w-full max-w-md h-96 bg-white rounded-lg animate-pulse" />}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
