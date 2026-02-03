/**
 * Email template for contact form submissions.
 */

import { escapeHtml, getAppConfig } from "@/lib/email";

export function buildContactFormEmail(options: {
  name: string;
  email: string;
  subject: string;
  message: string;
}): {
  subject: string;
  html: string;
} {
  const { appName } = getAppConfig();

  const subject = `[${appName}] ${options.subject}`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5; color: #18181b;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="min-width: 100%; background-color: #f4f4f5;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 480px; background-color: #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <tr>
            <td style="padding: 40px 32px;">
              <h1 style="margin: 0 0 24px; font-size: 24px; font-weight: 600; color: #18181b;">
                New contact form submission
              </h1>
              <p style="margin: 0 0 16px; font-size: 16px; line-height: 24px; color: #3f3f46;">
                You have received a new message through the contact form.
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin: 0 0 24px; font-size: 16px; line-height: 24px; color: #3f3f46;">
                <tr><td style="padding: 4px 0;"><strong>Name:</strong></td><td style="padding: 4px 0;">${escapeHtml(options.name)}</td></tr>
                <tr><td style="padding: 4px 0;"><strong>Email:</strong></td><td style="padding: 4px 0;"><a href="mailto:${escapeHtml(options.email)}" style="color: #2563eb; text-decoration: underline;">${escapeHtml(options.email)}</a></td></tr>
                <tr><td style="padding: 4px 0;"><strong>Subject:</strong></td><td style="padding: 4px 0;">${escapeHtml(options.subject)}</td></tr>
              </table>
              <div style="margin: 0 0 24px; padding: 16px; background-color: #fafafa; border-radius: 6px; border: 1px solid #e4e4e7;">
                <p style="margin: 0; font-size: 16px; line-height: 24px; color: #3f3f46; white-space: pre-wrap;">${escapeHtml(options.message)}</p>
              </div>
              <p style="margin: 0; font-size: 14px; line-height: 20px; color: #71717a;">
                You can reply directly to this email to respond to ${escapeHtml(options.name)}.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 24px 32px; border-top: 1px solid #e4e4e7;">
              <p style="margin: 0; font-size: 12px; line-height: 16px; color: #a1a1aa; text-align: center;">
                &copy; ${new Date().getFullYear()} ${escapeHtml(appName)}. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`.trim();

  return { subject, html };
}
