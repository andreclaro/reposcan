"use client";

import { signIn } from "next-auth/react";
import { Github, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface SignInButtonProps {
  callbackUrl?: string;
}

export function GitHubSignInButton({ callbackUrl = "/app" }: SignInButtonProps) {
  return (
    <div className="space-y-3">
      {/* Basic Login - No repo access */}
      <Button
        onClick={() => signIn("github", { callbackUrl })}
        className="w-full h-11 gap-2"
        size="lg"
        variant="outline"
      >
        <Lock className="h-4 w-4" />
        Continue with GitHub (Basic)
      </Button>
      <p className="text-xs text-muted-foreground text-center">
        Only email and profile access. No repository permissions.
      </p>

      {/* With Public Repo Access */}
      <Button
        onClick={() => signIn("github", { 
          callbackUrl,
          authorizationParams: {
            scope: "read:user user:email public_repo"
          }
        })}
        className="w-full h-11 gap-2"
        size="lg"
      >
        <Github className="h-5 w-5" />
        Continue with GitHub (with Repo Access)
      </Button>
      <p className="text-xs text-muted-foreground text-center">
        Includes read-only access to your public repositories.
      </p>

      <div className="pt-2 border-t">
        <p className="text-xs text-muted-foreground">
          <strong>Why two options?</strong> The basic option provides better privacy 
          by not accessing your repositories. For scanning private repositories, 
          you can add a <code>GITHUB_TOKEN</code> in your settings later.
        </p>
      </div>
    </div>
  );
}
