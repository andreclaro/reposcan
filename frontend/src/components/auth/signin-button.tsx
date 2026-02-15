"use client";

import { signIn } from "next-auth/react";
import { Github, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SignInButtonProps {
  callbackUrl?: string;
}

export function GitHubSignInButton({ callbackUrl = "/app" }: SignInButtonProps) {
  return (
    <div className="space-y-4">
      <Button
        onClick={() => signIn("github", { callbackUrl })}
        className="w-full h-11 gap-2"
        size="lg"
      >
        <Lock className="h-4 w-4" />
        Continue with GitHub
      </Button>

      <div className="space-y-2 text-xs text-muted-foreground">
        <p>
          <strong>Permissions:</strong> Email and profile only. 
          No repository access requested.
        </p>
        <p>
          <strong>Public repos:</strong> Can be scanned without authentication.
        </p>
        <p>
          <strong>Private repos:</strong> Add a GitHub token in Settings for secure, 
          server-side scanning.
        </p>
      </div>
    </div>
  );
}
