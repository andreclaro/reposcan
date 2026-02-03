/**
 * Email template for admin notification when a new user signs up (pending approval).
 */

import { escapeHtml, getAppConfig } from "@/lib/email";

export function buildNewUserPendingApprovalEmail(options: {
  userName?: string | null;
  userEmail: string;
}): {
  subject: string;
  html: string;
} {
  const { appName, appUrl } = getAppConfig();
  const adminUsersUrl = `${appUrl}/app/admin/users`;

  const subject = `[${appName}] New user pending approval`;

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
                New user pending approval
              </h1>
              <p style="margin: 0 0 16px; font-size: 16px; line-height: 24px; color: #3f3f46;">
                A new user has signed up and is waiting for admin approval.
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin: 0 0 24px; font-size: 16px; line-height: 24px; color: #3f3f46;">
                <tr><td style="padding: 4px 0;"><strong>Name:</strong></td><td style="padding: 4px 0;">${escapeHtml(options.userName ?? "—")}</td></tr>
                <tr><td style="padding: 4px 0;"><strong>Email:</strong></td><td style="padding: 4px 0;">${escapeHtml(options.userEmail)}</td></tr>
              </table>
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin: 0 0 24px;">
                <tr>
                  <td style="border-radius: 6px; background-color: #18181b;">
                    <a href="${escapeHtml(adminUsersUrl)}" target="_blank" style="display: inline-block; padding: 12px 24px; font-size: 16px; font-weight: 500; color: #ffffff; text-decoration: none;">
                      Open admin panel
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin: 0; font-size: 14px; line-height: 20px; color: #71717a;">
                Enable the user from the admin panel to allow them to access the service. They will receive an approval email once enabled.
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
