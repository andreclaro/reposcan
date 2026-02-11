/**
 * Shared email utility for sending transactional emails via Resend.
 */

import { logger } from "@/lib/logger.server";

export type SendEmailResult =
  | { success: true; id: string }
  | { success: false; error: string }
  | { skipped: true; reason: string };

/**
 * Send an email using Resend API.
 * Gracefully handles missing configuration by returning a skipped result.
 */
export async function sendEmail(options: {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail =
    process.env.RESEND_FROM ?? "SecurityKit <onboarding@resend.dev>";

  if (!apiKey) {
    logger.warn("sendEmail: RESEND_API_KEY not configured, skipping email");
    return { skipped: true, reason: "RESEND_API_KEY not configured" };
  }

  try {
    const { Resend } = await import("resend");
    const client = new Resend(apiKey);

    const { data, error } = await client.emails.send({
      from: fromEmail,
      to: [options.to],
      subject: options.subject,
      html: options.html,
      ...(options.replyTo && { replyTo: options.replyTo }),
    });

    if (error) {
      logger.error("sendEmail: Resend API error:", error);
      return { success: false, error: error.message };
    }

    logger.info("sendEmail: Email sent successfully", { id: data?.id, to: options.to });
    return { success: true, id: data?.id ?? "" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("sendEmail: Exception:", message);
    return { success: false, error: message };
  }
}

/**
 * Escape HTML special characters to prevent XSS.
 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Get app configuration from environment variables.
 */
export function getAppConfig(): { appName: string; appUrl: string } {
  return {
    appName: process.env.APP_NAME ?? "SecurityKit",
    appUrl: process.env.APP_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3003",
  };
}
