"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

type AppNavProps = {
  isAdmin: boolean;
};

export default function AppNav({ isAdmin }: AppNavProps) {
  const pathname = usePathname();

  const isOnDashboard = pathname === "/app";
  const isOnAdmin = pathname.startsWith("/app/admin");

  return (
    <nav className="flex items-center gap-4 text-sm">
      <Link
        href="/app"
        className={cn(
          "transition-colors",
          isOnDashboard
            ? "text-foreground font-medium"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        Dashboard
      </Link>
      {isAdmin && (
        <Link
          href="/app/admin"
          className={cn(
            "transition-colors",
            isOnAdmin
              ? "text-foreground font-medium"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Admin
        </Link>
      )}
    </nav>
  );
}
