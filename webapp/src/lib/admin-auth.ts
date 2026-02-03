/**
 * Admin authentication helpers.
 * Uses ADMIN_EMAIL environment variable (supports comma-separated list).
 */

export function isAdmin(email: string | null | undefined): boolean {
  const adminEmails = process.env.ADMIN_EMAIL;
  if (!adminEmails || !email) {
    return false;
  }

  const adminList = adminEmails
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  return adminList.includes(email.toLowerCase());
}

/**
 * Returns the list of admin emails from ADMIN_EMAIL (comma-separated).
 * Used e.g. to send admin notification emails.
 */
export function getAdminEmails(): string[] {
  const adminEmails = process.env.ADMIN_EMAIL;
  if (!adminEmails) return [];
  return adminEmails
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}
