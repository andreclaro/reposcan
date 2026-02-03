/**
 * Email template for account approval notifications.
 */

import { escapeHtml, getAppConfig } from "@/lib/email";

export function buildAccountApprovedEmail(options: {
  userName?: string | null;
}): {
  subject: string;
  html: string;
} {
  const { appName, appUrl } = getAppConfig();
  const loginUrl = `${appUrl}/login`;
  const greeting = options.userName
    ? `Hi ${escapeHtml(options.userName)},`
    : "Hi there,";

  const subject = `Your ${appName} account has been approved`;

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
                Account Approved
              </h1>
              <p style="margin: 0 0 16px; font-size: 16px; line-height: 24px; color: #3f3f46;">
                ${greeting}
              </p>
              <p style="margin: 0 0 24px; font-size: 16px; line-height: 24px; color: #3f3f46;">
                Great news! Your ${escapeHtml(appName)} account has been approved. You can now log in and start using the platform.
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin: 0 0 24px;">
                <tr>
                  <td style="border-radius: 6px; background-color: #18181b;">
                    <a href="${escapeHtml(loginUrl)}" target="_blank" style="display: inline-block; padding: 12px 24px; font-size: 16px; font-weight: 500; color: #ffffff; text-decoration: none;">
                      Log In Now
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin: 0; font-size: 14px; line-height: 20px; color: #71717a;">
                If you have any questions, feel free to reach out to our support team.
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
