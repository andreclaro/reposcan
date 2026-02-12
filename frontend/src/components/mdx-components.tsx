import type { MDXComponents } from "mdx/types";
import { cn } from "@/lib/utils";

// Import individual fumadocs-ui components
import { Accordion, Accordions } from "fumadocs-ui/components/accordion";
import { Callout } from "fumadocs-ui/components/callout";
import { Card, Cards } from "fumadocs-ui/components/card";
import { CodeBlock, CodeBlockTabs } from "fumadocs-ui/components/codeblock";
import { Tab, Tabs } from "fumadocs-ui/components/tabs";

export function getMDXComponents(): MDXComponents {
  return {
    // Override default elements
    pre: ({ className, ...props }: React.HTMLAttributes<HTMLPreElement>) => (
      <div
        className={cn(
          "mb-4 mt-6 max-h-[650px] overflow-x-auto rounded-lg border bg-zinc-950 p-4 dark:bg-zinc-900",
          className
        )}
      >
        <pre className="text-sm text-zinc-50" {...props} />
      </div>
    ),
    code: ({ className, ...props }: React.HTMLAttributes<HTMLElement>) => (
      <code
        className={cn(
          "relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm",
          className
        )}
        {...props}
      />
    ),
    // Fumadocs components
    Accordion,
    Accordions,
    Callout,
    Card,
    Cards,
    Tab,
    Tabs,
    CodeBlock,
    CodeBlockTabs,
    // Tables
    table: ({ className, ...props }: React.HTMLAttributes<HTMLTableElement>) => (
      <div className="my-6 w-full overflow-y-auto">
        <table
          className={cn(
            "w-full border-collapse text-sm",
            className
          )}
          {...props}
        />
      </div>
    ),
    th: ({ className, ...props }: React.HTMLAttributes<HTMLTableCellElement>) => (
      <th
        className={cn(
          "border px-4 py-2 text-left font-semibold",
          className
        )}
        {...props}
      />
    ),
    td: ({ className, ...props }: React.HTMLAttributes<HTMLTableCellElement>) => (
      <td
        className={cn(
          "border px-4 py-2",
          className
        )}
        {...props}
      />
    ),
  };
}
