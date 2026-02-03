"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";

type UserRow = {
  id: string;
  email: string | null;
  name: string | null;
  planId: string | null;
  planName: string | null;
  planCodename: string | null;
  stripeSubscriptionId: string | null;
  isEnabled: boolean;
  usage: { scansUsed: number; scansLimit: number };
  createdAt: string | null;
};

export default function AdminUsersList() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [userToDelete, setUserToDelete] = useState<UserRow | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [emailStatus, setEmailStatus] = useState<string | null>(null);

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

  const toggleEnabled = async (userId: string, currentEnabled: boolean) => {
    setEmailStatus(null);
    setUpdating(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isEnabled: !currentEnabled })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update user");
      }

      // Update local state
      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId ? { ...u, isEnabled: !currentEnabled } : u
        )
      );

      // Show approval email result when enabling a user
      if (!currentEnabled && data.emailSent) {
        setEmailStatus("Approval email sent to user.");
      } else if (!currentEnabled && data.emailSkipReason) {
        setEmailStatus(`Approval email not sent: ${data.emailSkipReason}`);
      } else if (!currentEnabled && data.emailError) {
        setEmailStatus(`Approval email failed: ${data.emailError}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setUpdating(null);
    }
  };

  const handleDelete = async () => {
    if (!userToDelete) return;

    if (deleteConfirmText !== "DELETE") {
      setError('Please type "DELETE" to confirm');
      return;
    }

    setDeleting(userToDelete.id);
    setError(null);

    try {
      const res = await fetch(`/api/admin/users/${userToDelete.id}`, {
        method: "DELETE"
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete user");
      }

      // Remove user from local state
      setUsers((prev) => prev.filter((u) => u.id !== userToDelete.id));
      setUserToDelete(null);
      setDeleteConfirmText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete user");
    } finally {
      setDeleting(null);
    }
  };

  if (loading) return <p className="text-sm text-muted-foreground">Loading users…</p>;
  if (error) return <p className="text-sm text-destructive">{error}</p>;

  return (
    <>
      {emailStatus && (
        <Alert
          variant={emailStatus.startsWith("Approval email sent") ? "default" : "destructive"}
          className="mb-4"
        >
          <AlertDescription>{emailStatus}</AlertDescription>
        </Alert>
      )}
      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-3 font-medium">Email</th>
              <th className="text-left p-3 font-medium">Status</th>
              <th className="text-left p-3 font-medium">Plan</th>
              <th className="text-left p-3 font-medium">Usage</th>
              <th className="text-left p-3 font-medium">Subscription</th>
              <th className="text-right p-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t">
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    {u.email ?? u.id}
                    {!u.isEnabled && (
                      <Badge variant="secondary" className="text-xs">
                        Pending
                      </Badge>
                    )}
                  </div>
                </td>
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={u.isEnabled}
                      onCheckedChange={() => toggleEnabled(u.id, u.isEnabled)}
                      disabled={updating === u.id}
                      aria-label={u.isEnabled ? "Disable user" : "Enable user"}
                    />
                    <span
                      className={`text-xs ${
                        u.isEnabled ? "text-green-600" : "text-amber-600"
                      }`}
                    >
                      {u.isEnabled ? "Active" : "Disabled"}
                    </span>
                  </div>
                </td>
                <td className="p-3">{u.planName ?? "Free"}</td>
                <td className="p-3">
                  {u.usage.scansUsed} / {u.usage.scansLimit < 0 ? "∞" : u.usage.scansLimit}
                </td>
                <td className="p-3">
                  {u.stripeSubscriptionId ? "Active" : "—"}
                </td>
                <td className="p-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/app/admin/users/${u.id}`}>View</Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => setUserToDelete(u)}
                      title="Delete user"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!userToDelete} onOpenChange={() => setUserToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">Delete User</DialogTitle>
            <DialogDescription>
              This action cannot be undone. This will permanently delete the user account
              and all associated data including scans, findings, and usage history.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <Alert variant="destructive">
              <AlertDescription>
                You are about to delete: <strong>{userToDelete?.email}</strong>
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <label htmlFor="confirm-delete" className="text-sm font-medium">
                Type <strong>DELETE</strong> to confirm:
              </label>
              <input
                id="confirm-delete"
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="Type DELETE to confirm"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setUserToDelete(null);
                setDeleteConfirmText("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting === userToDelete?.id || deleteConfirmText !== "DELETE"}
            >
              {deleting === userToDelete?.id ? "Deleting…" : "Delete User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
