import Link from "next/link";

import SignOutButton from "@/components/sign-out-button";
import { getServerAuth } from "@/lib/server-auth";

export default async function AppLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const session = await getServerAuth();

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-6">
            <Link href="/" className="text-sm font-semibold">
              SecurityKit
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              <Link
                href="/app"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                Dashboard
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span>{session?.user?.email}</span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
