"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, CreditCard, Users, Scan } from "lucide-react";

import { cn } from "@/lib/utils";

const adminNav: Array<{
  name: string;
  href: "/app/admin" | "/app/admin/plans" | "/app/admin/users";
  icon: typeof LayoutDashboard;
}> = [
  { name: "Dashboard", href: "/app/admin", icon: LayoutDashboard },
  { name: "Scans", href: "/app/admin", icon: Scan },
  { name: "Plans", href: "/app/admin/plans", icon: CreditCard },
  { name: "Users", href: "/app/admin/users", icon: Users }
];

export default function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-6 space-y-1 rounded-lg border bg-background p-2">
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
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-accent text-accent-foreground"
                : "hover:bg-accent hover:text-accent-foreground"
            )}
          >
            <Icon className="size-4" />
            {item.name}
          </Link>
        );
      })}
    </nav>
  );
}
