import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { docs } from "@/lib/docs";
import { getMDXComponents } from "@/components/mdx-components";

interface PageProps {
  params: Promise<{ slug?: string[] }>;
}

// Helper to get page path from slug
function getPagePath(slug: string[]): string {
  if (slug.length === 0) {
    return "getting-started/index.mdx";
  }
  return `${slug.join("/")}.mdx`;
}

export default async function Page(props: PageProps) {
  const params = await props.params;
  const slug = params.slug || [];
  const expectedPath = getPagePath(slug);
  
  // Find the page in the docs data by matching the file path
  const page = docs.docs.find((p) => 
    p.info.path.endsWith(expectedPath)
  );
  
  if (!page) {
    notFound();
  }
  
  // The MDXContent is the body property directly on the page
  const MDXContent = page.body;
  
  return (
    <>
      <h1 className="text-3xl font-bold mb-4">{(page as unknown as { title: string }).title}</h1>
      {(page as unknown as { description?: string }).description && (
        <p className="text-lg text-muted-foreground mb-8">
          {(page as unknown as { description?: string }).description}
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
  const expectedPath = getPagePath(slug);
  
  const page = docs.docs.find((p) => 
    p.info.path.endsWith(expectedPath)
  );
  
  if (!page) {
    return { title: "Not Found" };
  }
  
  return {
    title: (page as unknown as { title: string }).title,
    description: (page as unknown as { description?: string }).description,
  };
}

export function generateStaticParams(): { slug: string[] }[] {
  return docs.docs.map((page) => {
    const relativePath = page.info.path.replace("src/content/docs/", "").replace(".mdx", "");
    return { slug: relativePath.split("/") };
  });
}
