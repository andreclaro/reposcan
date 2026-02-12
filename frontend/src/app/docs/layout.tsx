import type { ReactNode } from "react";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { RootProvider } from "fumadocs-ui/provider/next";
import { docs } from "@/lib/docs";
import { loader } from "fumadocs-core/source";

export default async function Layout({ children }: { children: ReactNode }) {
  // Convert the docs to a page tree using fumadocs-core loader
  const source = docs.toFumadocsSource();
  const pageTree = loader({
    baseUrl: "/docs",
    source,
  }).pageTree;
  
  return (
    <RootProvider>
      <DocsLayout
        tree={pageTree}
        nav={{
          title: "SecurityKit Docs",
          url: "/docs",
        }}
        sidebar={{
          defaultOpenLevel: 1,
        }}
      >
        {children}
      </DocsLayout>
    </RootProvider>
  );
}
