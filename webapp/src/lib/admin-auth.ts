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
