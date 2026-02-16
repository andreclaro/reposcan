"use client";

import { useEffect, useState } from "react";

interface StatusData {
  overall: string;
  components: {
    frontend: string;
    fastapi: string;
    postgresql: string;
    redis: string;
  };
  timestamp: string;
}

export default function AdminStatusPage() {
  const [status, setStatus] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/status");
      if (!res.ok) {
        throw new Error(`Failed to fetch status: ${res.status}`);
      }
      const data = await res.json();
      setStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const getStatusColor = (s: string) => {
    switch (s) {
      case "up":
        return "text-green-600 bg-green-50";
      case "down":
        return "text-red-600 bg-red-50";
      case "degraded":
        return "text-yellow-600 bg-yellow-50";
      default:
        return "text-gray-600 bg-gray-50";
    }
  };

  const getOverallColor = (s: string) => {
    switch (s) {
      case "up":
        return "bg-green-500";
      case "degraded":
        return "bg-yellow-500";
      case "down":
        return "bg-red-500";
      default:
        return "bg-gray-500";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">System Status</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Check the health of all system components.
          </p>
        </div>
        <button
          onClick={fetchStatus}
          disabled={loading}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 p-4 text-sm text-red-600">
          Error: {error}
        </div>
      )}

      {status && (
        <>
          {/* Overall Status */}
          <div className="rounded-lg border bg-card p-6">
            <div className="flex items-center gap-4">
              <div
                className={`h-4 w-4 rounded-full ${getOverallColor(
                  status.overall
                )}`}
              />
              <div>
                <p className="text-sm text-muted-foreground">Overall Status</p>
                <p className="text-lg font-semibold capitalize">
                  {status.overall}
                </p>
              </div>
            </div>
          </div>

          {/* Component Status */}
          <div className="rounded-lg border bg-card">
            <div className="border-b px-6 py-4">
              <h2 className="font-semibold">Component Status</h2>
            </div>
            <div className="divide-y">
              <div className="flex items-center justify-between px-6 py-4">
                <span className="font-medium">Frontend (Next.js)</span>
                <span
                  className={`rounded-full px-3 py-1 text-sm font-medium capitalize ${getStatusColor(
                    status.components.frontend
                  )}`}
                >
                  {status.components.frontend}
                </span>
              </div>
              <div className="flex items-center justify-between px-6 py-4">
                <span className="font-medium">Backend (FastAPI)</span>
                <span
                  className={`rounded-full px-3 py-1 text-sm font-medium capitalize ${getStatusColor(
                    status.components.fastapi
                  )}`}
                >
                  {status.components.fastapi}
                </span>
              </div>
              <div className="flex items-center justify-between px-6 py-4">
                <span className="font-medium">PostgreSQL</span>
                <span
                  className={`rounded-full px-3 py-1 text-sm font-medium capitalize ${getStatusColor(
                    status.components.postgresql
                  )}`}
                >
                  {status.components.postgresql}
                </span>
              </div>
              <div className="flex items-center justify-between px-6 py-4">
                <span className="font-medium">Redis</span>
                <span
                  className={`rounded-full px-3 py-1 text-sm font-medium capitalize ${getStatusColor(
                    status.components.redis
                  )}`}
                >
                  {status.components.redis}
                </span>
              </div>
            </div>
          </div>

          {/* Timestamp */}
          <p className="text-right text-xs text-muted-foreground">
            Last updated: {new Date(status.timestamp).toLocaleString()}
          </p>
        </>
      )}
    </div>
  );
}
