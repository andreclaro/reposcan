"use client";

import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";

export default function DebugPage() {
  const { status } = useSession();
  const [tokenInfo, setTokenInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (status === "authenticated") {
      fetch("/api/debug/token")
        .then(r => r.json())
        .then(data => {
          setTokenInfo(data);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    } else if (status === "unauthenticated") {
      setLoading(false);
    }
  }, [status]);

  const resetAccount = async () => {
    if (!confirm("This will delete your account and all scan history. Continue?")) return;
    const res = await fetch("/api/reset-account", { method: "POST" });
    const data = await res.json();
    setMessage(data.message || "Account reset. Signing out...");
    setTimeout(() => signOut({ callbackUrl: "/" }), 2000);
  };

  if (status === "loading" || loading) {
    return <div className="p-8">Loading...</div>;
  }

  if (status === "unauthenticated") {
    return <div className="p-8">Please sign in first.</div>;
  }

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-bold mb-4">GitHub Token Debug</h1>
      
      {tokenInfo?.error ? (
        <div className="text-red-600">{tokenInfo.error}</div>
      ) : (
        <div className="space-y-4">
          <div className="bg-slate-100 p-4 rounded">
            <p><strong>DB Scope:</strong> {tokenInfo?.db_scope || "none"}</p>
            <p><strong>GitHub Scopes:</strong> {tokenInfo?.github_scopes || "none"}</p>
            <p><strong>Has repo scope:</strong> {tokenInfo?.has_repo_scope ? "Yes" : "No"}</p>
          </div>

          {!tokenInfo?.has_repo_scope && (
            <div className="bg-amber-50 border border-amber-200 p-4 rounded">
              <p className="font-semibold text-amber-800">Missing repo scope!</p>
              <p className="text-sm text-amber-700 mb-4">
                Your token is missing the 'repo' scope needed for private repositories.
              </p>
              
              <button
                onClick={resetAccount}
                className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
              >
                Reset Entire Account
              </button>
              
              {message && (
                <p className="mt-2 text-sm text-green-700">{message}</p>
              )}
              
              <div className="mt-4 text-sm text-amber-700">
                <p>This will:</p>
                <ol className="list-decimal ml-5 mt-1">
                  <li>Delete your user account</li>
                  <li>Delete all your scan history</li>
                  <li>Sign you out automatically</li>
                  <li>Let you sign in fresh with GitHub</li>
                </ol>
              </div>
            </div>
          )}

          <button
            onClick={() => signOut()}
            className="border border-slate-300 px-4 py-2 rounded hover:bg-slate-50"
          >
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}
