"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CreditCard, Users, Scan, Wrench, Shield, ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { HIDE_PLANS } from "@/lib/config";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

const adminNav: Array<{
  name: string;
  href: "/app/admin" | "/app/admin/plans" | "/app/admin/users" | "/app/admin/tools" | "/app/admin/scanners";
  icon: typeof Scan;
}> = [
  { name: "Scans", href: "/app/admin", icon: Scan },
  { name: "Plans", href: "/app/admin/plans", icon: CreditCard },
  { name: "Users", href: "/app/admin/users", icon: Users },
  { name: "Tools", href: "/app/admin/tools", icon: Wrench },
  { name: "Scanners", href: "/app/admin/scanners", icon: Shield },
];

type AppNavProps = {
  isAdmin: boolean;
};

export default function AppNav({ isAdmin }: AppNavProps) {
  const pathname = usePathname();
  const router = useRouter();

  const isOnDashboard = pathname === "/app";
  const isOnAdmin = pathname.startsWith("/app/admin");
  const isOnPlans = pathname === "/plans";
  const isOnContact = pathname === "/contact";

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
      {!HIDE_PLANS && (
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
      )}
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
      {isAdmin && (
        <div className="relative">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  "flex items-center gap-0.5 transition-colors",
                  isOnAdmin
                    ? "text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Admin
                <ChevronDown className="size-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-40">
              {adminNav.map((item) => {
                const Icon = item.icon;
                const active =
                  item.href === "/app/admin"
                    ? pathname === "/app/admin" || pathname === "/app/admin/"
                    : pathname.startsWith(item.href);
                return (
                  <DropdownMenuItem
                    key={item.name}
                    onClick={() => router.push(item.href)}
                    className={cn(
                      "flex cursor-pointer items-center gap-2",
                      active && "bg-accent font-medium"
                    )}
                  >
                    <Icon className="size-3.5" />
                    {item.name}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </nav>
  );
}
