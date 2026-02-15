/**
 * GitHub App integration utilities
 * 
 * Provides functions for:
 * - Generating GitHub App JWTs
 * - Creating installation access tokens
 * - Listing repositories accessible to an installation
 */

import { createPrivateKey } from "crypto";
import { SignJWT } from "jose";

interface GitHubAppConfig {
  appId: string;
  privateKey: string;
  clientId?: string;
  clientSecret?: string;
}

interface InstallationToken {
  token: string;
  expiresAt: string;
  repositories?: Array<{
    id: number;
    name: string;
    fullName: string;
    private: boolean;
  }>;
}

/**
 * Get GitHub App configuration from environment
 */
export function getGitHubAppConfig(): GitHubAppConfig | null {
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;

  if (!appId || !privateKey) {
    return null;
  }

  return {
    appId,
    privateKey: privateKey.replace(/\\n/g, "\n"),
    clientId: process.env.GITHUB_APP_CLIENT_ID,
    clientSecret: process.env.GITHUB_APP_CLIENT_SECRET
  };
}

/**
 * Generate JWT for GitHub App authentication
 * This JWT is used to authenticate as the GitHub App itself
 */
export async function generateAppJWT(): Promise<string | null> {
  const config = getGitHubAppConfig();
  if (!config) {
    throw new Error("GitHub App not configured");
  }

  try {
    // Import the private key
    const privateKey = createPrivateKey(config.privateKey);
    
    // Generate JWT
    const jwt = await new SignJWT({
      iss: config.appId,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 600, // 10 minutes max
    })
      .setProtectedHeader({ alg: "RS256" })
      .sign(privateKey);

    return jwt;
  } catch (error) {
    console.error("Error generating GitHub App JWT:", error);
    return null;
  }
}

/**
 * Generate an installation access token
 * This token is used to access resources on behalf of an installation
 */
export async function generateInstallationToken(
  installationId: number
): Promise<InstallationToken | null> {
  try {
    const jwt = await generateAppJWT();
    if (!jwt) {
      throw new Error("Failed to generate app JWT");
    }

    const response = await fetch(
      `https://api.github.com/app/installations/${installationId}/access_tokens`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${jwt}`,
          "Accept": "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28"
        }
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error("GitHub API error:", error);
      throw new Error(`Failed to generate installation token: ${response.status}`);
    }

    const data = await response.json();
    
    return {
      token: data.token,
      expiresAt: data.expires_at,
      repositories: data.repositories?.map((repo: any) => ({
        id: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        private: repo.private
      }))
    };
  } catch (error) {
    console.error("Error generating installation token:", error);
    return null;
  }
}

/**
 * Get repositories accessible to an installation
 */
export async function getInstallationRepositories(
  installationId: number
): Promise<Array<{ id: number; name: string; fullName: string; private: boolean }>> {
  try {
    const tokenData = await generateInstallationToken(installationId);
    if (!tokenData) {
      throw new Error("Failed to get installation token");
    }

    const response = await fetch(
      "https://api.github.com/installation/repositories",
      {
        headers: {
          "Authorization": `Bearer ${tokenData.token}`,
          "Accept": "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28"
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch repositories: ${response.status}`);
    }

    const data = await response.json();
    
    return data.repositories.map((repo: any) => ({
      id: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      private: repo.private
    }));
  } catch (error) {
    console.error("Error fetching installation repositories:", error);
    return [];
  }
}

/**
 * Check if a user has access to a specific repository via GitHub App
 */
export async function hasRepoAccessViaApp(
  installationId: number,
  repoFullName: string
): Promise<boolean> {
  try {
    const repos = await getInstallationRepositories(installationId);
    return repos.some(repo => repo.fullName.toLowerCase() === repoFullName.toLowerCase());
  } catch (error) {
    console.error("Error checking repo access:", error);
    return false;
  }
}

/**
 * Verify webhook signature from GitHub
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string | null,
  secret: string
): boolean {
  if (!signature) {
    return false;
  }

  try {
    const { createHmac } = require("crypto");
    const hmac = createHmac("sha256", secret);
    hmac.update(payload);
    const digest = `sha256=${hmac.digest("hex")}`;
    
    // Timing-safe comparison
    return signature.length === digest.length && 
           signature.split("").every((char, i) => char === digest[i]);
  } catch (error) {
    console.error("Error verifying webhook signature:", error);
    return false;
  }
}
