"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";

export default function ResetPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const res = await fetch("/api/reset-by-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      setMessage(data.message || "If an account exists with that email, it has been reset.");
    } catch {
      setMessage("Request failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Account Reset</h1>
          {error === "OAuthAccountNotLinked" && (
            <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded text-amber-800 text-sm">
              <p className="font-semibold">Your GitHub connection was reset.</p>
              <p>Enter your email below to reset your account, then sign in again.</p>
            </div>
          )}
        </div>

        <form onSubmit={handleReset} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-md border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
              placeholder="your@email.com"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-red-600 text-white py-2 rounded-md hover:bg-red-700 disabled:opacity-50"
          >
            {loading ? "Resetting..." : "Reset Account"}
          </button>
        </form>

        {message && (
          <div className="p-4 bg-green-50 border border-green-200 rounded text-green-800 text-sm">
            {message}
          </div>
        )}

        <div className="text-center">
          <a href="/login" className="text-blue-600 hover:underline text-sm">
            Back to Login
          </a>
        </div>
      </div>
    </div>
  );
}
