"use client";

import { signIn } from "next-auth/react";
import { Github, Lock, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SignInButtonProps {
  callbackUrl?: string;
}

export function GitHubSignInButton({ callbackUrl = "/app" }: SignInButtonProps) {
  return (
    <div className="space-y-4">
      {/* Basic Login - No repo access */}
      <div className="space-y-1">
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
          Only email and profile. No repository access.
        </p>
      </div>

      {/* Public Repos Only */}
      <div className="space-y-1">
        <Button
          onClick={() => signIn("github-public", { callbackUrl })}
          className="w-full h-11 gap-2"
          size="lg"
          variant="secondary"
        >
          <Github className="h-5 w-5" />
          Continue with GitHub (Public Repos)
        </Button>
        <p className="text-xs text-muted-foreground text-center">
          Read-only access to your public repositories.
        </p>
      </div>

      {/* Private Repos */}
      <div className="space-y-1">
        <Button
          onClick={() => signIn("github-private", { callbackUrl })}
          className="w-full h-11 gap-2"
          size="lg"
        >
          <Shield className="h-5 w-5" />
          Continue with GitHub (Private Repos)
        </Button>
        <p className="text-xs text-muted-foreground text-center">
          Access to public and private repositories.
        </p>
      </div>

      <div className="pt-2 border-t">
        <p className="text-xs text-muted-foreground">
          <strong>Privacy note:</strong> Choose the minimum access level you need. 
          You can also use a <code>GITHUB_TOKEN</code> in settings for server-side access 
          without granting OAuth permissions.
        </p>
      </div>
    </div>
  );
}
