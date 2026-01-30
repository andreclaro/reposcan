"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type PlanFormInitial = {
  id: string;
  name: string;
  codename: string;
  default: boolean;
  monthlyPrice: number;
  yearlyPrice: number;
  monthlyStripePriceId: string;
  yearlyStripePriceId: string;
  trialDays: number | null;
  quotas: { scans_per_month?: number };
};

type PlanFormProps = {
  action: "create" | "edit";
  initial?: PlanFormInitial;
};

export default function PlanForm({ action, initial }: PlanFormProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(initial?.name ?? "");
  const [codename, setCodename] = useState(initial?.codename ?? "");
  const [isDefault, setIsDefault] = useState(initial?.default ?? false);
  const [monthlyPrice, setMonthlyPrice] = useState(
    String(initial?.monthlyPrice ?? 0)
  );
  const [yearlyPrice, setYearlyPrice] = useState(
    String(initial?.yearlyPrice ?? 0)
  );
  const [monthlyStripePriceId, setMonthlyStripePriceId] = useState(
    initial?.monthlyStripePriceId ?? ""
  );
  const [yearlyStripePriceId, setYearlyStripePriceId] = useState(
    initial?.yearlyStripePriceId ?? ""
  );
  const [trialDays, setTrialDays] = useState(
    initial?.trialDays != null ? String(initial.trialDays) : ""
  );
  const [scansPerMonth, setScansPerMonth] = useState(
    String(initial?.quotas?.scans_per_month ?? 5)
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const monthly = parseInt(monthlyPrice, 10);
    const yearly = parseInt(yearlyPrice, 10);
    const trial = trialDays === "" ? null : parseInt(trialDays, 10);
    const scans = parseInt(scansPerMonth, 10);

    const body: Record<string, unknown> = {
      name: name.trim(),
      codename: codename.trim().toLowerCase(),
      default: isDefault,
      monthlyPrice: isNaN(monthly) ? null : monthly,
      yearlyPrice: isNaN(yearly) ? null : yearly,
      monthlyStripePriceId: monthlyStripePriceId.trim() || null,
      yearlyStripePriceId: yearlyStripePriceId.trim() || null,
      trialDays: trial,
      quotas: { scans_per_month: isNaN(scans) ? 5 : scans }
    };

    if (action === "edit" && initial?.id) {
      (body as Record<string, string>).id = initial.id;
    }

    try {
      const res = await fetch("/api/admin/plans", {
        method: action === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Failed to save plan");
        return;
      }
      router.push("/app/admin/plans");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save plan");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-xl">
      {error && (
        <div className="rounded-md bg-destructive/10 text-destructive text-sm p-3">
          {error}
        </div>
      )}
      <div>
        <label className="block text-sm font-medium mb-1">Name</label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Pro"
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Codename</label>
        <Input
          value={codename}
          onChange={(e) => setCodename(e.target.value)}
          placeholder="pro"
          required
        />
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="default"
          checked={isDefault}
          onChange={(e) => setIsDefault(e.target.checked)}
          className="rounded"
        />
        <label htmlFor="default" className="text-sm font-medium">
          Default plan (for new users)
        </label>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">
            Monthly price (cents)
          </label>
          <Input
            type="number"
            min={0}
            value={monthlyPrice}
            onChange={(e) => setMonthlyPrice(e.target.value)}
            placeholder="2900"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">
            Yearly price (cents)
          </label>
          <Input
            type="number"
            min={0}
            value={yearlyPrice}
            onChange={(e) => setYearlyPrice(e.target.value)}
            placeholder="29000"
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">
          Monthly Stripe price ID
        </label>
        <Input
          value={monthlyStripePriceId}
          onChange={(e) => setMonthlyStripePriceId(e.target.value)}
          placeholder="price_..."
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">
          Yearly Stripe price ID
        </label>
        <Input
          value={yearlyStripePriceId}
          onChange={(e) => setYearlyStripePriceId(e.target.value)}
          placeholder="price_..."
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">
          Trial days (optional)
        </label>
        <Input
          type="number"
          min={0}
          max={14}
          value={trialDays}
          onChange={(e) => setTrialDays(e.target.value)}
          placeholder="14"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">
          Scans per month (-1 = unlimited)
        </label>
        <Input
          type="number"
          value={scansPerMonth}
          onChange={(e) => setScansPerMonth(e.target.value)}
          placeholder="50"
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : action === "create" ? "Create plan" : "Update plan"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/app/admin/plans")}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
