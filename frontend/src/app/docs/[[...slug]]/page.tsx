import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPage, getAllPageUrls } from "@/lib/docs";
import { getMDXComponents } from "@/components/mdx-components";

interface PageProps {
  params: Promise<{ slug?: string[] }>;
}

// Dynamically import MDX content based on slug
async function getMDXContent(slug: string[]) {
  const path = slug?.join("/") || "";
  
  try {
    // Map paths to MDX modules
    const mdxModules: Record<string, () => Promise<{ default: React.ComponentType; frontmatter?: Record<string, string> }>> = {
      // Getting Started
      "": () => import("@/content/docs/getting-started/index.mdx"),
      "getting-started": () => import("@/content/docs/getting-started/index.mdx"),
      "getting-started/quickstart": () => import("@/content/docs/getting-started/quickstart.mdx"),
      "getting-started/installation": () => import("@/content/docs/getting-started/installation.mdx"),
      
      // Features
      "features": () => import("@/content/docs/features/index.mdx"),
      "features/sast": () => import("@/content/docs/features/sast.mdx"),
      "features/containers": () => import("@/content/docs/features/containers.mdx"),
      "features/infrastructure": () => import("@/content/docs/features/infrastructure.mdx"),
      "features/dependencies": () => import("@/content/docs/features/dependencies.mdx"),
      "features/ai-analysis": () => import("@/content/docs/features/ai-analysis.mdx"),
      
      // API Reference
      "api-reference": () => import("@/content/docs/api-reference/index.mdx"),
      "api-reference/authentication": () => import("@/content/docs/api-reference/authentication.mdx"),
      "api-reference/endpoints": () => import("@/content/docs/api-reference/endpoints.mdx"),
      "api-reference/webhooks": () => import("@/content/docs/api-reference/webhooks.mdx"),
      "api-reference/errors": () => import("@/content/docs/api-reference/errors.mdx"),
      
      // Guides
      "guides": () => import("@/content/docs/guides/index.mdx"),
      "guides/cli": () => import("@/content/docs/guides/cli.mdx"),
      "guides/docker": () => import("@/content/docs/guides/docker.mdx"),
      "guides/configuration": () => import("@/content/docs/guides/configuration.mdx"),
      "guides/github-integration": () => import("@/content/docs/guides/github-integration.mdx"),
      "guides/ci-cd": () => import("@/content/docs/guides/ci-cd.mdx"),
      
      // Support
      "support": () => import("@/content/docs/support/index.mdx"),
      "support/faq": () => import("@/content/docs/support/faq.mdx"),
      "support/troubleshooting": () => import("@/content/docs/support/troubleshooting.mdx"),
    };
    
    const loader = mdxModules[path];
    if (!loader) {
      return null;
    }
    
    return await loader();
  } catch (error) {
    console.error(`Failed to load MDX content for path: ${path}`, error);
    return null;
  }
}

export default async function Page(props: PageProps) {
  const params = await props.params;
  const slug = params.slug || [];
  const path = slug.join("/");
  
  // Check if page exists in tree
  const pageUrl = `/docs/${path}`;
  const page = getPage(pageUrl === "/docs/" ? "/docs" : pageUrl);
  
  if (!page) {
    notFound();
  }
  
  // Load MDX content
  const mdxModule = await getMDXContent(slug);
  
  if (!mdxModule) {
    notFound();
  }
  
  const MDXContent = mdxModule.default;
  const frontmatter = mdxModule.frontmatter || {};
  
  return (
    <>
      <h1 className="text-3xl font-bold mb-4">{frontmatter.title || page.name}</h1>
      {frontmatter.description && (
        <p className="text-lg text-muted-foreground mb-8">
          {frontmatter.description}
        </p>
      )}
      <div className="prose prose-slate dark:prose-invert max-w-none">
        <MDXContent components={getMDXComponents()} />
      </div>
    </>
  );
}

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const params = await props.params;
  const slug = params.slug || [];
  const path = slug.join("/");
  const pageUrl = `/docs/${path}`;
  
  const page = getPage(pageUrl === "/docs/" ? "/docs" : pageUrl);
  
  if (!page) {
    return { title: "Not Found" };
  }
  
  // Try to get frontmatter from module
  const mdxModule = await getMDXContent(slug);
  const frontmatter = mdxModule?.frontmatter || {};
  
  return {
    title: frontmatter.title || page.name,
    description: frontmatter.description,
  };
}

export function generateStaticParams(): { slug: string[] }[] {
  const urls = getAllPageUrls();
  
  return urls.map((url) => {
    const slug = url.replace("/docs", "").replace(/^\//, "");
    return { slug: slug ? slug.split("/") : [] };
  });
}
