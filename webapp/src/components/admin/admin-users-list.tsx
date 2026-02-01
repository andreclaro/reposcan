"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

type UserRow = {
  id: string;
  email: string | null;
  name: string | null;
  planId: string | null;
  planName: string | null;
  planCodename: string | null;
  stripeSubscriptionId: string | null;
  usage: { scansUsed: number; scansLimit: number };
  createdAt: string | null;
};

export default function AdminUsersList() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/users")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load users");
        return res.json();
      })
      .then((data: { users: UserRow[] }) => setUsers(data.users ?? []))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-sm text-muted-foreground">Loading users…</p>;
  if (error) return <p className="text-sm text-destructive">{error}</p>;

  return (
    <div className="rounded-lg border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="text-left p-3 font-medium">Email</th>
            <th className="text-left p-3 font-medium">Plan</th>
            <th className="text-left p-3 font-medium">Usage</th>
            <th className="text-left p-3 font-medium">Subscription</th>
            <th className="text-right p-3 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-t">
              <td className="p-3">{u.email ?? u.id}</td>
              <td className="p-3">{u.planName ?? "Free"}</td>
              <td className="p-3">
                {u.usage.scansUsed} / {u.usage.scansLimit < 0 ? "∞" : u.usage.scansLimit}
              </td>
              <td className="p-3">
                {u.stripeSubscriptionId ? "Active" : "—"}
              </td>
              <td className="p-3 text-right">
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/app/admin/users/${u.id}`}>View</Link>
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
