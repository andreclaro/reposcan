import { docsLoader } from "fumadocs-core/source";
import { createMDXSource } from "fumadocs-mdx";
import { map } from "@/.source";

export const { docs, meta } = createMDXSource(map);

export const source = docsLoader({
  baseUrl: "/docs",
  source: { docs, meta },
});
