import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/github-app";
import { getDb } from "@/db";
import { githubAppInstallations } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * POST /api/github/webhook
 * Handles GitHub App webhook events
 */
export async function POST(request: NextRequest) {
  const payload = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  const eventType = request.headers.get("x-github-event");
  
  const webhookSecret = process.env.GITHUB_APP_WEBHOOK_SECRET;
  
  if (!webhookSecret) {
    console.error("GitHub App webhook secret not configured");
    return NextResponse.json(
      { error: "Webhook not configured" },
      { status: 500 }
    );
  }

  // Verify webhook signature
  if (!verifyWebhookSignature(payload, signature, webhookSecret)) {
    console.error("Invalid webhook signature");
    return NextResponse.json(
      { error: "Invalid signature" },
      { status: 401 }
    );
  }

  const data = JSON.parse(payload);

  try {
    switch (eventType) {
      case "installation":
        await handleInstallationEvent(data);
        break;
        
      case "installation_repositories":
        await handleInstallationRepositoriesEvent(data);
        break;
        
      case "repository":
        await handleRepositoryEvent(data);
        break;
        
      default:
        // Acknowledge other events but don't process them
        console.log(`Received unhandled GitHub event: ${eventType}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Error processing webhook:", error);
    return NextResponse.json(
      { error: "Failed to process webhook" },
      { status: 500 }
    );
  }
}

/**
 * Handle installation events (created, deleted, suspend, unsuspend)
 */
async function handleInstallationEvent(data: any) {
  const action = data.action;
  const installation = data.installation;

  console.log(`Handling installation event: ${action}`, {
    installationId: installation?.id,
    account: installation?.account?.login
  });

  const db = getDb();

  switch (action) {
    case "created":
      // Installation created - this is handled by the callback endpoint
      // But we can update repository list here if needed
      console.log("Installation created:", installation.id);
      break;

    case "deleted":
      // Remove installation from database
      await db
        .delete(githubAppInstallations)
        .where(eq(githubAppInstallations.installationId, installation.id));
      console.log("Installation deleted:", installation.id);
      break;

    case "suspend":
      // Mark installation as suspended
      await db
        .update(githubAppInstallations)
        .set({ suspended: true, updatedAt: new Date() })
        .where(eq(githubAppInstallations.installationId, installation.id));
      console.log("Installation suspended:", installation.id);
      break;

    case "unsuspend":
      // Mark installation as active
      await db
        .update(githubAppInstallations)
        .set({ suspended: false, updatedAt: new Date() })
        .where(eq(githubAppInstallations.installationId, installation.id));
      console.log("Installation unsuspended:", installation.id);
      break;

    case "new_permissions_accepted":
      // User accepted new permissions
      console.log("New permissions accepted:", installation.id);
      break;
  }
}

/**
 * Handle installation_repositories events (added, removed)
 */
async function handleInstallationRepositoriesEvent(data: any) {
  const action = data.action;
  const installation = data.installation;
  const repositoriesAdded = data.repositories_added || [];
  const repositoriesRemoved = data.repositories_removed || [];

  console.log(`Handling installation_repositories event: ${action}`, {
    installationId: installation?.id,
    added: repositoriesAdded.length,
    removed: repositoriesRemoved.length
  });

  const db = getDb();

  // Get current installation
  const existing = await db
    .select({ repositories: githubAppInstallations.repositories })
    .from(githubAppInstallations)
    .where(eq(githubAppInstallations.installationId, installation.id))
    .limit(1);

  if (existing.length === 0) {
    console.warn("Installation not found:", installation.id);
    return;
  }

  const currentRepos = existing[0].repositories || [];
  let updatedRepos = [...currentRepos];

  if (action === "added") {
    // Add new repositories
    const newRepoNames = repositoriesAdded.map((repo: any) => repo.full_name);
    updatedRepos = [...new Set([...updatedRepos, ...newRepoNames])];
  } else if (action === "removed") {
    // Remove repositories
    const removedRepoNames = repositoriesRemoved.map((repo: any) => repo.full_name);
    updatedRepos = updatedRepos.filter(repo => !removedRepoNames.includes(repo));
  }

  // Update database
  await db
    .update(githubAppInstallations)
    .set({
      repositories: updatedRepos,
      updatedAt: new Date()
    })
    .where(eq(githubAppInstallations.installationId, installation.id));
}

/**
 * Handle repository events (archived, unarchived, publicized, privatized)
 */
async function handleRepositoryEvent(data: any) {
  const action = data.action;
  const repository = data.repository;
  const installation = data.installation;

  console.log(`Handling repository event: ${action}`, {
    repository: repository?.full_name,
    installationId: installation?.id
  });

  // These events don't require action on our part,
  // but we log them for debugging
}
