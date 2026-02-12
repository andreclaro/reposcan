declare module "*.mdx" {
  import type { ComponentType, ReactNode } from "react";
  import type { MDXComponents } from "mdx/types";
  
  export interface Frontmatter {
    title?: string;
    description?: string;
    icon?: string;
    [key: string]: unknown;
  }
  
  export const frontmatter: Frontmatter;
  
  interface MDXProps {
    components?: MDXComponents;
  }
  
  const MDXContent: ComponentType<MDXProps>;
  export default MDXContent;
}
