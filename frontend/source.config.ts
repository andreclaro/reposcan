import { defineConfig, defineDocs } from "fumadocs-mdx/config";

export const docs = defineDocs({
  dir: "./src/content/docs",
});

export default defineConfig({
  // Optional: Add plugins or MDX options
  mdxOptions: {
    // remark/rehype plugins
  },
});
