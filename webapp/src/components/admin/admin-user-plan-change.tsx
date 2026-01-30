"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { plans } from "@/db/schema";

type Plan = typeof plans.$inferSelect;

type Props = {
  userId: string;
  currentPlanId: string | null;
  plans: Plan[];
};

export default function AdminUserPlanChange({
  userId,
  currentPlanId,
  plans: plansList
}: Props) {
  const router = useRouter();
  const [selectedPlanId, setSelectedPlanId] = useState(currentPlanId ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlanId) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/plan`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: selectedPlanId })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Failed to update plan");
        return;
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2 mt-2">
      <select
        value={selectedPlanId}
        onChange={(e) => setSelectedPlanId(e.target.value)}
        className="rounded-md border bg-background px-3 py-2 text-sm min-w-[160px]"
      >
        <option value="">—</option>
        {plansList.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} ({p.codename})
          </option>
        ))}
      </select>
      <Button type="submit" size="sm" disabled={submitting || !selectedPlanId}>
        {submitting ? "Saving…" : "Update plan"}
      </Button>
      {error && (
        <span className="text-sm text-destructive">{error}</span>
      )}
    </form>
  );
}
