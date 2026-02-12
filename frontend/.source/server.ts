// @ts-nocheck
import * as __fd_glob_28 from "../src/content/docs/support/troubleshooting.mdx?collection=docs"
import * as __fd_glob_27 from "../src/content/docs/support/index.mdx?collection=docs"
import * as __fd_glob_26 from "../src/content/docs/support/faq.mdx?collection=docs"
import * as __fd_glob_25 from "../src/content/docs/guides/index.mdx?collection=docs"
import * as __fd_glob_24 from "../src/content/docs/guides/github-integration.mdx?collection=docs"
import * as __fd_glob_23 from "../src/content/docs/guides/docker.mdx?collection=docs"
import * as __fd_glob_22 from "../src/content/docs/guides/configuration.mdx?collection=docs"
import * as __fd_glob_21 from "../src/content/docs/guides/cli.mdx?collection=docs"
import * as __fd_glob_20 from "../src/content/docs/guides/ci-cd.mdx?collection=docs"
import * as __fd_glob_19 from "../src/content/docs/getting-started/quickstart.mdx?collection=docs"
import * as __fd_glob_18 from "../src/content/docs/getting-started/installation.mdx?collection=docs"
import * as __fd_glob_17 from "../src/content/docs/getting-started/index.mdx?collection=docs"
import * as __fd_glob_16 from "../src/content/docs/features/sast.mdx?collection=docs"
import * as __fd_glob_15 from "../src/content/docs/features/infrastructure.mdx?collection=docs"
import * as __fd_glob_14 from "../src/content/docs/features/index.mdx?collection=docs"
import * as __fd_glob_13 from "../src/content/docs/features/dependencies.mdx?collection=docs"
import * as __fd_glob_12 from "../src/content/docs/features/containers.mdx?collection=docs"
import * as __fd_glob_11 from "../src/content/docs/features/ai-analysis.mdx?collection=docs"
import * as __fd_glob_10 from "../src/content/docs/api-reference/webhooks.mdx?collection=docs"
import * as __fd_glob_9 from "../src/content/docs/api-reference/index.mdx?collection=docs"
import * as __fd_glob_8 from "../src/content/docs/api-reference/errors.mdx?collection=docs"
import * as __fd_glob_7 from "../src/content/docs/api-reference/endpoints.mdx?collection=docs"
import * as __fd_glob_6 from "../src/content/docs/api-reference/authentication.mdx?collection=docs"
import { default as __fd_glob_5 } from "../src/content/docs/support/meta.json?collection=docs"
import { default as __fd_glob_4 } from "../src/content/docs/guides/meta.json?collection=docs"
import { default as __fd_glob_3 } from "../src/content/docs/getting-started/meta.json?collection=docs"
import { default as __fd_glob_2 } from "../src/content/docs/api-reference/meta.json?collection=docs"
import { default as __fd_glob_1 } from "../src/content/docs/features/meta.json?collection=docs"
import { default as __fd_glob_0 } from "../src/content/docs/meta.json?collection=docs"
import { server } from 'fumadocs-mdx/runtime/server';
import type * as Config from '../source.config';

const create = server<typeof Config, import("fumadocs-mdx/runtime/types").InternalTypeConfig & {
  DocData: {
  }
}>({"doc":{"passthroughs":["extractedReferences"]}});

export const docs = await create.docs("docs", "src/content/docs", {"meta.json": __fd_glob_0, "features/meta.json": __fd_glob_1, "api-reference/meta.json": __fd_glob_2, "getting-started/meta.json": __fd_glob_3, "guides/meta.json": __fd_glob_4, "support/meta.json": __fd_glob_5, }, {"api-reference/authentication.mdx": __fd_glob_6, "api-reference/endpoints.mdx": __fd_glob_7, "api-reference/errors.mdx": __fd_glob_8, "api-reference/index.mdx": __fd_glob_9, "api-reference/webhooks.mdx": __fd_glob_10, "features/ai-analysis.mdx": __fd_glob_11, "features/containers.mdx": __fd_glob_12, "features/dependencies.mdx": __fd_glob_13, "features/index.mdx": __fd_glob_14, "features/infrastructure.mdx": __fd_glob_15, "features/sast.mdx": __fd_glob_16, "getting-started/index.mdx": __fd_glob_17, "getting-started/installation.mdx": __fd_glob_18, "getting-started/quickstart.mdx": __fd_glob_19, "guides/ci-cd.mdx": __fd_glob_20, "guides/cli.mdx": __fd_glob_21, "guides/configuration.mdx": __fd_glob_22, "guides/docker.mdx": __fd_glob_23, "guides/github-integration.mdx": __fd_glob_24, "guides/index.mdx": __fd_glob_25, "support/faq.mdx": __fd_glob_26, "support/index.mdx": __fd_glob_27, "support/troubleshooting.mdx": __fd_glob_28, });