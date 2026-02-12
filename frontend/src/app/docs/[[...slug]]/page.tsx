import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { source } from "@/lib/docs";
import { getMDXComponents } from "@/components/mdx-components";

interface PageProps {
  params: Promise<{ slug?: string[] }>;
}

export default async function Page(props: PageProps) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  const MDXContent = page.data.body;

  return (
    <>
      <h1 className="text-3xl font-bold mb-4">{page.data.title}</h1>
      {page.data.description && (
        <p className="text-lg text-muted-foreground mb-8">
          {page.data.description}
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
  const page = source.getPage(params.slug);
  if (!page) notFound();

  return {
    title: page.data.title,
    description: page.data.description,
  };
}

export function generateStaticParams(): { slug: string[] }[] {
  return source.generateParams().map((item) => ({
    slug: item.slug,
  }));
}
