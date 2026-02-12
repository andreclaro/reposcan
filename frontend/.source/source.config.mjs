// source.config.ts
import { defineConfig, defineDocs } from "fumadocs-mdx/config";
var docs = defineDocs({
  dir: "./src/content/docs"
});
var source_config_default = defineConfig({
  // Optional: Add plugins or MDX options
  mdxOptions: {
    // remark/rehype plugins
  }
});
export {
  source_config_default as default,
  docs
};
