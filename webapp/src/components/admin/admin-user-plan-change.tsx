"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { plans } from "@/db/schema";

type Plan = typeof plans.$inferSelect;

type Props = {
  userId: string;
  currentPlanId: string | null;
  currentPlanCodename: string | null;
  scansPerMonthOverride: number | null;
  plans: Plan[];
};

export default function AdminUserPlanChange({
  userId,
  currentPlanId,
  currentPlanCodename,
  scansPerMonthOverride,
  plans: plansList
}: Props) {
  const router = useRouter();
  const [selectedPlanId, setSelectedPlanId] = useState(currentPlanId ?? "");
  const [customScansOnChange, setCustomScansOnChange] = useState("");
  const [customLimitValue, setCustomLimitValue] = useState(
    scansPerMonthOverride != null ? String(scansPerMonthOverride) : ""
  );
  const [submitting, setSubmitting] = useState(false);
  const [limitSubmitting, setLimitSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limitError, setLimitError] = useState<string | null>(null);

  const selectedPlan = plansList.find((p) => p.id === selectedPlanId);
  const isCustomSelected = selectedPlan?.codename === "custom";
  const isCurrentPlanCustom = currentPlanCodename === "custom";

  const handlePlanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlanId) return;
    setError(null);
    setSubmitting(true);
    try {
      const body: { planId: string; scansPerMonthOverride?: number } = {
        planId: selectedPlanId
      };
      if (isCustomSelected && customScansOnChange !== "") {
        const n = parseInt(customScansOnChange, 10);
        if (!Number.isNaN(n) && n >= -1) body.scansPerMonthOverride = n;
      }
      const res = await fetch(`/api/admin/users/${userId}/plan`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
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

  const handleLimitSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isCurrentPlanCustom) return;
    setLimitError(null);
    setLimitSubmitting(true);
    try {
      const n = parseInt(customLimitValue, 10);
      if (Number.isNaN(n) || n < -1) {
        setLimitError("Use -1 for unlimited or a non-negative number");
        setLimitSubmitting(false);
        return;
      }
      const res = await fetch(`/api/admin/users/${userId}/plan`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scansPerMonthOverride: n })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setLimitError(data.error ?? "Failed to update limit");
        return;
      }
      router.refresh();
    } catch (err) {
      setLimitError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLimitSubmitting(false);
    }
  };

  return (
    <div className="space-y-3 mt-2">
      <form onSubmit={handlePlanSubmit} className="flex flex-wrap items-end gap-2">
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
        {isCustomSelected && (
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground whitespace-nowrap">
              Scans/mo (this customer):
            </label>
            <Input
              type="number"
              min={-1}
              className="w-20 h-8 text-sm"
              placeholder="-1"
              value={customScansOnChange}
              onChange={(e) => setCustomScansOnChange(e.target.value)}
            />
          </div>
        )}
        <Button type="submit" size="sm" disabled={submitting || !selectedPlanId}>
          {submitting ? "Saving…" : "Update plan"}
        </Button>
        {error && <span className="text-sm text-destructive">{error}</span>}
      </form>

      {isCurrentPlanCustom && (
        <form onSubmit={handleLimitSubmit} className="flex items-end gap-2">
          <span className="text-sm font-medium text-muted-foreground">
            Custom limit (this customer):
          </span>
          <Input
            type="number"
            min={-1}
            className="w-24 h-8 text-sm"
            placeholder="-1 = unlimited"
            value={customLimitValue}
            onChange={(e) => setCustomLimitValue(e.target.value)}
          />
          <Button type="submit" size="sm" disabled={limitSubmitting}>
            {limitSubmitting ? "Saving…" : "Update limit"}
          </Button>
          {limitError && (
            <span className="text-sm text-destructive">{limitError}</span>
          )}
        </form>
      )}
    </div>
  );
}
