"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Share2,
  Copy,
  Trash2,
  Link2,
  Check,
  Clock,
  X,
  Shield
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface Share {
  id: string;
  token: string;
  shareType: "full" | "summary";
  expiresAt: string | null;
  createdAt: string;
}

interface ScanShareDialogProps {
  scanId: string;
  scanStatus: string;
  /** Controlled open state (optional - for programmatic control) */
  open?: boolean;
  /** Callback when open state changes (optional - for programmatic control) */
  onOpenChange?: (open: boolean) => void;
  /** Callback when a share is created */
  onShareCreated?: (token: string) => void;
}

export default function ScanShareDialog({
  scanId,
  scanStatus,
  open: controlledOpen,
  onOpenChange,
  onShareCreated
}: ScanShareDialogProps) {
  const [shares, setShares] = useState<Share[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [shareType, setShareType] = useState<"full" | "summary">("full");
  const [expiresInDays, setExpiresInDays] = useState<string>("never");
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [internalOpen, setInternalOpen] = useState(false);
  
  // Use controlled or uncontrolled open state
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setIsOpen = (open: boolean) => {
    if (controlledOpen === undefined) {
      setInternalOpen(open);
    }
    onOpenChange?.(open);
  };

  const fetchShares = useCallback(async () => {
    if (!isOpen) return;
    setIsLoading(true);
    try {
      const response = await fetch(`/api/scans/${scanId}/share`);
      if (response.ok) {
        const data = await response.json();
        setShares(data.shares);
      }
    } catch {
      // Silent error
    } finally {
      setIsLoading(false);
    }
  }, [scanId, isOpen]);

  useEffect(() => {
    fetchShares();
  }, [fetchShares]);

  const handleCreateShare = async () => {
    setIsCreating(true);
    setError(null);
    try {
      const body: { shareType: string; expiresInDays?: number } = {
        shareType
      };
      if (expiresInDays !== "never") {
        body.expiresInDays = parseInt(expiresInDays);
      }

      const response = await fetch(`/api/scans/${scanId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create share");
      }

      const data = await response.json();
      setShares((prev) => [data.share, ...prev]);
      onShareCreated?.(data.share.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create share");
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteShare = async (shareId: string) => {
    try {
      const response = await fetch(
        `/api/scans/${scanId}/share/${shareId}`,
        {
          method: "DELETE"
        }
      );

      if (response.ok) {
        setShares((prev) => prev.filter((s) => s.id !== shareId));
      }
    } catch {
      // Silent error
    }
  };

  const copyToClipboard = async (token: string) => {
    const url = `${window.location.origin}/share/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(null), 2000);
    } catch {
      // Silent error
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric"
    });
  };

  const isCompleted = scanStatus === "completed";

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {controlledOpen === undefined && (
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <Share2 className="h-4 w-4" />
            Share
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5" />
            Share Scan Report
          </DialogTitle>
          <DialogDescription>
            Create a public link to share this scan report with others.
          </DialogDescription>
        </DialogHeader>

        {!isCompleted && (
          <Alert variant="destructive">
            <AlertDescription>
              Only completed scans can be shared. Please wait for the scan to
              finish.
            </AlertDescription>
          </Alert>
        )}

        {isCompleted && (
          <>
            {/* Create New Share */}
            <div className="space-y-4 rounded-lg border bg-slate-50 p-4">
              <h4 className="text-sm font-medium">Create New Share Link</h4>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm text-slate-600">Share Type</label>
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-sm ${
                        shareType === "summary" ? "font-medium" : "text-slate-400"
                      }`}
                    >
                      Summary Only
                    </span>
                    <Switch
                      checked={shareType === "full"}
                      onCheckedChange={(checked) =>
                        setShareType(checked ? "full" : "summary")
                      }
                    />
                    <span
                      className={`text-sm ${
                        shareType === "full" ? "font-medium" : "text-slate-400"
                      }`}
                    >
                      Full Report
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <label className="text-sm text-slate-600">Expires</label>
                  <Select value={expiresInDays} onValueChange={setExpiresInDays}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="never">Never</SelectItem>
                      <SelectItem value="7">7 days</SelectItem>
                      <SelectItem value="30">30 days</SelectItem>
                      <SelectItem value="90">90 days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  onClick={handleCreateShare}
                  disabled={isCreating}
                  className="w-full gap-2"
                >
                  {isCreating ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Link2 className="h-4 w-4" />
                      Create Share Link
                    </>
                  )}
                </Button>

                {error && (
                  <p className="text-sm text-red-600">{error}</p>
                )}
              </div>
            </div>

            {/* Existing Shares */}
            {shares.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-sm font-medium">Active Share Links</h4>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {shares.map((share) => (
                    <div
                      key={share.id}
                      className="flex items-center gap-3 rounded-lg border p-3"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {share.shareType === "full" ? "Full" : "Summary"}
                          </Badge>
                          {share.expiresAt && (
                            <Badge
                              variant="secondary"
                              className="text-xs gap-1"
                            >
                              <Clock className="h-3 w-3" />
                              Expires {formatDate(share.expiresAt)}
                            </Badge>
                          )}
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <Input
                            value={`${window.location.origin}/share/${share.token}`}
                            readOnly
                            className="h-8 text-xs bg-slate-50"
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0"
                            onClick={() => copyToClipboard(share.token)}
                          >
                            {copiedToken === share.token ? (
                              <Check className="h-4 w-4 text-green-500" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => handleDeleteShare(share.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {isLoading && shares.length === 0 && (
              <p className="text-center text-sm text-slate-500">
                Loading shares...
              </p>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
