"use client";

import { signIn } from "next-auth/react";
import { Github } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SignInButtonProps {
  callbackUrl?: string;
}

export function GitHubSignInButton({ callbackUrl = "/app" }: SignInButtonProps) {
  return (
    <Button
      onClick={() => signIn("github", { callbackUrl })}
      className="w-full h-11 gap-2"
      size="lg"
    >
      <Github className="h-5 w-5" />
      Continue with GitHub
    </Button>
  );
}
