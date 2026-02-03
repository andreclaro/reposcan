"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CreditCard, Users, Scan, Wrench } from "lucide-react";

import { cn } from "@/lib/utils";

const adminNav: Array<{
  name: string;
  href: "/app/admin" | "/app/admin/plans" | "/app/admin/users";
  icon: typeof Scan;
}> = [
  { name: "Scans", href: "/app/admin", icon: Scan },
  { name: "Plans", href: "/app/admin/plans", icon: CreditCard },
  { name: "Users", href: "/app/admin/users", icon: Users }
];

type AppNavProps = {
  isAdmin: boolean;
};

export default function AppNav({ isAdmin }: AppNavProps) {
  const pathname = usePathname();

  const isOnDashboard = pathname === "/app";
  const isOnAdmin = pathname.startsWith("/app/admin");
  const isOnPlans = pathname === "/plans";
  const isOnContact = pathname === "/contact";
  const isOnTools = pathname === "/app/tools";

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
      <Link
        href="/plans"
        className={cn(
          "transition-colors",
          isOnPlans
            ? "text-foreground font-medium"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        Plans
      </Link>
      <Link
        href="/contact"
        className={cn(
          "transition-colors",
          isOnContact
            ? "text-foreground font-medium"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        Contact
      </Link>
      <Link
        href="/app/tools"
        className={cn(
          "transition-colors",
          isOnTools
            ? "text-foreground font-medium"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        Tools
      </Link>
      {isAdmin && (
        <>
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
          {isOnAdmin && (
            <span className="flex items-center gap-2 text-muted-foreground">
              <span className="text-border">|</span>
              {adminNav.map((item) => {
                const Icon = item.icon;
                const active =
                  item.href === "/app/admin"
                    ? pathname === "/app/admin" || pathname === "/app/admin/"
                    : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-1 transition-colors",
                      active
                        ? "text-foreground font-medium"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Icon className="size-3.5" />
                    {item.name}
                  </Link>
                );
              })}
            </span>
          )}
        </>
      )}
    </nav>
  );
}
