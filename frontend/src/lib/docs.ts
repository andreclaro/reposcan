import type { PageTree } from "fumadocs-core/server";
import type { InferMetaType, InferPageType } from "fumadocs-core/source";

// Manual page tree definition
// This could be generated at build time by a script

export const pageTree: PageTree = {
  name: "Documentation",
  children: [
    {
      type: "folder",
      name: "Getting Started",
      url: "/docs/getting-started",
      icon: "Rocket",
      children: [
        { type: "page", name: "Introduction", url: "/docs/getting-started" },
        { type: "page", name: "Quick Start", url: "/docs/getting-started/quickstart" },
        { type: "page", name: "Installation", url: "/docs/getting-started/installation" },
      ],
    },
    {
      type: "folder",
      name: "Features",
      url: "/docs/features",
      icon: "Shield",
      children: [
        { type: "page", name: "Overview", url: "/docs/features" },
        { type: "page", name: "SAST", url: "/docs/features/sast" },
        { type: "page", name: "Containers", url: "/docs/features/containers" },
        { type: "page", name: "Infrastructure", url: "/docs/features/infrastructure" },
        { type: "page", name: "Dependencies", url: "/docs/features/dependencies" },
        { type: "page", name: "AI Analysis", url: "/docs/features/ai-analysis" },
      ],
    },
    {
      type: "folder",
      name: "API Reference",
      url: "/docs/api-reference",
      icon: "Code",
      children: [
        { type: "page", name: "Overview", url: "/docs/api-reference" },
        { type: "page", name: "Authentication", url: "/docs/api-reference/authentication" },
        { type: "page", name: "Endpoints", url: "/docs/api-reference/endpoints" },
        { type: "page", name: "Webhooks", url: "/docs/api-reference/webhooks" },
        { type: "page", name: "Errors", url: "/docs/api-reference/errors" },
      ],
    },
    {
      type: "folder",
      name: "Guides",
      url: "/docs/guides",
      icon: "BookOpen",
      children: [
        { type: "page", name: "Overview", url: "/docs/guides" },
        { type: "page", name: "CLI", url: "/docs/guides/cli" },
        { type: "page", name: "Docker", url: "/docs/guides/docker" },
        { type: "page", name: "Configuration", url: "/docs/guides/configuration" },
        { type: "page", name: "GitHub Integration", url: "/docs/guides/github-integration" },
        { type: "page", name: "CI/CD", url: "/docs/guides/ci-cd" },
      ],
    },
    {
      type: "folder",
      name: "Support",
      url: "/docs/support",
      icon: "HelpCircle",
      children: [
        { type: "page", name: "Support Center", url: "/docs/support" },
        { type: "page", name: "FAQ", url: "/docs/support/faq" },
        { type: "page", name: "Troubleshooting", url: "/docs/support/troubleshooting" },
      ],
    },
  ],
};

// Helper to find a page by URL
export function getPage(url: string) {
  function findInTree(items: PageTree.Node[]): PageTree.Item | undefined {
    for (const item of items) {
      if (item.type === "page" && item.url === url) {
        return item;
      }
      if (item.type === "folder") {
        const found = findInTree(item.children);
        if (found) return found;
      }
    }
    return undefined;
  }
  
  return findInTree(pageTree.children);
}

// Helper to get all page URLs for static generation
export function getAllPageUrls(): string[] {
  const urls: string[] = [];
  
  function traverse(items: PageTree.Node[]) {
    for (const item of items) {
      if (item.type === "page") {
        urls.push(item.url);
      } else if (item.type === "folder") {
        traverse(item.children);
      }
    }
  }
  
  traverse(pageTree.children);
  return urls;
}
