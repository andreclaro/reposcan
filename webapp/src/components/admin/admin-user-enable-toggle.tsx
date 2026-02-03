"use client";

import { useState } from "react";

import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";

type Props = {
  userId: string;
  isEnabled: boolean;
  userEmail: string | null;
};

export default function AdminUserEnableToggle({ userId, isEnabled: initialEnabled, userEmail }: Props) {
  const [isEnabled, setIsEnabled] = useState(initialEnabled);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleToggle = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isEnabled: !isEnabled })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update user");
      }

      setIsEnabled(!isEnabled);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <Switch
          checked={isEnabled}
          onCheckedChange={handleToggle}
          disabled={isLoading}
          aria-label={isEnabled ? "Disable user" : "Enable user"}
        />
        <span
          className={`text-sm font-medium ${
            isEnabled ? "text-green-600" : "text-amber-600"
          }`}
        >
          {isEnabled ? "Active" : "Disabled"}
        </span>
        {isLoading && <span className="text-xs text-muted-foreground">Updating...</span>}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground">
        {isEnabled
          ? "User can log in and use the service."
          : "User cannot log in. Enable to grant access."}
      </p>
    </div>
  );
}
