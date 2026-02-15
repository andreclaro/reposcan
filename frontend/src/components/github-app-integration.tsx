"use client";

import { useState, useEffect } from "react";
import { Github, CheckCircle, XCircle, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface Installation {
  installationId: number;
  accountLogin: string;
  accountType: string;
  repositoryCount: number;
  suspended: boolean;
}

interface GitHubAppIntegrationProps {
  userId: string;
}

export function GitHubAppIntegration({ userId }: GitHubAppIntegrationProps) {
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetchInstallations();
  }, []);

  const fetchInstallations = async () => {
    try {
      const response = await fetch("/api/github/install");
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to fetch installations: ${response.status}`);
      }
      const data = await response.json();
      setInstallations(data.installations || []);
    } catch (err) {
      console.error("Error fetching installations:", err);
      setError(err instanceof Error ? err.message : "Failed to load installations");
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    setConnecting(true);
    setError(null);

    try {
      const response = await fetch("/api/github/install", { method: "POST" });
      if (!response.ok) {
        throw new Error("Failed to initiate connection");
      }
      const data = await response.json();
      
      // Open GitHub App installation in new window
      window.open(data.url, "_blank", "noopener,noreferrer");
      setConnecting(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect");
      setConnecting(false);
    }
  };

  const handleDisconnect = async (installationId: number) => {
    if (!confirm("Are you sure you want to disconnect this GitHub App installation?")) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/github/install?installationId=${installationId}`, {
        method: "DELETE"
      });

      if (!response.ok) {
        throw new Error("Failed to disconnect");
      }

      setSuccess("GitHub App disconnected successfully");
      await fetchInstallations();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to disconnect");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Github className="h-5 w-5" />
          GitHub Repository Access
        </CardTitle>
        <CardDescription>
          Connect your GitHub account to scan private repositories.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert className="bg-green-50 border-green-200 text-green-800">
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        )}

        {installations.length === 0 ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <XCircle className="h-5 w-5" />
              <span>Not connected</span>
            </div>
            
            <p className="text-sm text-muted-foreground">
              Public repositories can be scanned without authentication. 
              Connect your GitHub account to scan private repositories.
            </p>

            <Button
              onClick={handleConnect}
              disabled={connecting}
              className="w-full sm:w-auto gap-2"
            >
              {connecting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Github className="h-4 w-4" />
              )}
              {connecting ? "Connecting..." : "Connect GitHub Repositories"}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {installations.map((inst) => (
              <div
                key={inst.installationId}
                className="flex items-center justify-between p-4 border rounded-lg"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    <span className="font-medium">{inst.accountLogin}</span>
                    <span className="text-xs text-muted-foreground">
                      ({inst.accountType})
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {inst.repositoryCount} repository{inst.repositoryCount !== 1 ? "ies" : "y"} connected
                  </p>
                  {inst.suspended && (
                    <p className="text-sm text-amber-600">Suspended</p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                  >
                    <a
                      href={`https://github.com/settings/installations/${inst.installationId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="gap-1"
                    >
                      Manage
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDisconnect(inst.installationId)}
                  >
                    Disconnect
                  </Button>
                </div>
              </div>
            ))}

            <p className="text-xs text-muted-foreground">
              You can manage repository access on GitHub. Changes will be synced automatically.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
