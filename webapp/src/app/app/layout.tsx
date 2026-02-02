import Link from "next/link";
import { Shield } from "lucide-react";

import AppNav from "@/components/app-nav";
import SignOutButton from "@/components/sign-out-button";
import { getServerAuth } from "@/lib/server-auth";
import { isAdmin } from "@/lib/admin-auth";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerAuth();
  const userIsAdmin = isAdmin(session?.user?.email);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900">
                <Shield className="h-5 w-5 text-white" />
              </div>
              <span className="text-lg font-semibold text-slate-900">
                SecurityKit
              </span>
            </Link>
            <AppNav isAdmin={userIsAdmin} />
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden text-sm text-slate-500 sm:block">
              {session?.user?.email}
            </div>
            <SignOutButton />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
