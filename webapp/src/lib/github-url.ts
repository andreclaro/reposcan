/**
 * Shared GitHub URL parsing and normalization.
 */

export type ParsedGitHubRepo = {
  owner: string;
  repo: string;
};

/**
 * Parse and validate a GitHub URL or "owner/repo" shorthand.
 * Returns normalized URL and validity; use normalized URL when valid.
 */
export function parseGitHubUrl(
  url: string
): { valid: boolean; normalized?: string } {
  const trimmed = url.trim();
  if (!trimmed) {
    return { valid: false };
  }

  try {
    // Handle shorthand format: owner/repo
    if (/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(trimmed)) {
      const normalized = `https://github.com/${trimmed}`;
      return { valid: true, normalized };
    }

    // Handle URLs without protocol
    let urlToParse = trimmed;
    if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
      urlToParse = `https://${trimmed}`;
    }

    const urlObj = new URL(urlToParse);
    if (
      !["github.com", "www.github.com"].includes(urlObj.hostname.toLowerCase())
    ) {
      return { valid: false };
    }

    const parts = urlObj.pathname
      .replace(/\.git$/, "")
      .split("/")
      .filter(Boolean);
    if (parts.length < 2) {
      return { valid: false };
    }

    const normalized = `https://github.com/${parts[0]}/${parts[1]}`;
    return { valid: true, normalized };
  } catch {
    return { valid: false };
  }
}

/**
 * Extract owner and repo from a GitHub URL or "owner/repo" string.
 * Returns null if input is not a valid GitHub repo reference.
 */
export function parseGitHubRepo(input: string): ParsedGitHubRepo | null {
  if (!input) {
    return null;
  }

  try {
    // Shorthand: owner/repo
    const trimmed = input.trim();
    if (/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(trimmed)) {
      const [owner, repo] = trimmed.split("/");
      if (owner && repo) {
        return { owner, repo: repo.replace(/\.git$/i, "") };
      }
      return null;
    }

    const url = new URL(
      trimmed.startsWith("http") ? trimmed : `https://${trimmed}`
    );
    if (url.hostname.toLowerCase() !== "github.com") {
      return null;
    }

    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length < 2) {
      return null;
    }

    const owner = parts[0];
    const repo = parts[1].replace(/\.git$/i, "");
    if (!owner || !repo) {
      return null;
    }

    return { owner, repo };
  } catch {
    return null;
  }
}
