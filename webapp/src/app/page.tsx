import Link from "next/link";
import {
  ArrowRight,
  GitBranch,
  LineChart,
  Scan,
  ShieldCheck
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DEV_BYPASS_AUTH } from "@/lib/dev-auth";
import { getServerAuth } from "@/lib/server-auth";

const featureItems = [
  {
    title: "SAST + secrets scanning",
    description:
      "Static analysis powered by Semgrep rulesets to surface critical security flaws.",
    icon: ShieldCheck
  },
  {
    title: "Dockerfile + IaC checks",
    description:
      "Trivy, tfsec, checkov, and tflint cover container and Terraform exposure.",
    icon: Scan
  },
  {
    title: "Dependency audits",
    description:
      "Language-specific vulnerability checks for Node, Go, and Rust ecosystems.",
    icon: GitBranch
  },
  {
    title: "One scan, unified results",
    description:
      "A single scan pipeline produces consolidated findings per repository.",
    icon: LineChart
  }
];

export default async function HomePage() {
  const session = await getServerAuth();
  const isAuthed = Boolean(session?.user?.id);
  const isDevBypass = DEV_BYPASS_AUTH;

  return (
    <div className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_60%_at_50%_0%,rgba(186,125,39,0.12),transparent_60%)]"
      />

      <header className="relative mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs uppercase tracking-wide text-primary">
            AuditKit
          </span>
          <span className="text-muted-foreground">Security scan automation</span>
        </Link>
        <div className="flex items-center gap-3">
          {isDevBypass ? (
            <Button asChild size="sm" variant="secondary">
              <Link href="/app">Continue in dev mode</Link>
            </Button>
          ) : isAuthed ? (
            <Button asChild size="sm">
              <Link href="/app">Open dashboard</Link>
            </Button>
          ) : (
            <Button asChild size="sm">
              <Link href="/api/auth/signin/github?callbackUrl=/app">
                Sign in with GitHub
              </Link>
            </Button>
          )}
        </div>
      </header>

      <main className="relative">
        <section className="mx-auto w-full max-w-6xl px-6 pb-16 pt-10 lg:pt-16">
          <div className="grid gap-10 lg:grid-cols-1 lg:items-center">
            <div className="space-y-6 text-center">
              <div className="inline-flex items-center gap-2 rounded-full border bg-background px-4 py-1 text-xs text-muted-foreground shadow-sm">
                <ShieldCheck className="size-3 text-primary" />
                Scan GitHub repositories in minutes
              </div>
              <h1 className="max-w-none text-balance text-4xl font-semibold tracking-tight md:text-5xl">
                Automated security scans for every repository you ship.
              </h1>
              <p className="mx-auto max-w-3xl text-balance text-base text-muted-foreground md:text-lg">
                Point AuditKit at any GitHub repo and get a unified report across
                SAST, dependencies, Dockerfiles, and infrastructure. Built on the
                existing sec-audit pipeline.
              </p>

              <form
                action="/app"
                method="get"
                className="mx-auto flex w-full max-w-2xl flex-col gap-3 rounded-2xl border bg-card/70 p-4 shadow-sm md:flex-row"
              >
                <Input
                  name="repoUrl"
                  type="url"
                  placeholder="https://github.com/org/repo"
                  required
                  className="h-11"
                />
                <Button type="submit" size="lg" className="h-11">
                  Start scan
                  <ArrowRight className="size-4" />
                </Button>
              </form>
            </div>

            {/* <div className="rounded-3xl border bg-card/70 p-6 shadow-sm">
              <div className="space-y-5">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl border bg-background p-2">
                    <Scan className="size-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Live scan pipeline</p>
                    <p className="text-xs text-muted-foreground">
                      One worker per repository, end-to-end
                    </p>
                  </div>
                </div>
                <div className="space-y-3 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <GitBranch className="size-4 text-primary" />
                    Clone repo and detect languages
                  </div>
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="size-4 text-primary" />
                    Run SAST, Docker, Terraform, deps
                  </div>
                  <div className="flex items-center gap-2">
                    <LineChart className="size-4 text-primary" />
                    Aggregate and store results
                  </div>
                </div>
                <div className="rounded-2xl border bg-background/80 p-4 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">
                    Example output
                  </p>
                  <p className="mt-2">Status: running (60%)</p>
                  <p>Findings: Semgrep, tfsec, npm audit</p>
                  <p>Artifacts: results/scan-id/</p>
                </div>
              </div>
            </div> */}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-16">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {featureItems.map((feature) => {
              const Icon = feature.icon;
              return (
              <div
                key={feature.title}
                className="rounded-2xl border bg-card p-5 shadow-sm"
              >
                <div className="flex items-center gap-2">
                  <Icon className="size-4 text-primary" />
                  <h3 className="text-sm font-semibold">{feature.title}</h3>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {feature.description}
                </p>
              </div>
            )})}
          </div>
        </section>

        {/* <section className="mx-auto max-w-6xl px-6 pb-20">
          <div className="rounded-3xl border bg-card p-8 shadow-sm">
            <div className="grid gap-6 md:grid-cols-3">
              <div>
                <p className="text-sm font-semibold">1. Submit a repo</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Provide a GitHub URL and pick a branch to scan.
                </p>
              </div>
              <div>
                <p className="text-sm font-semibold">2. Run full pipeline</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  We clone, detect languages, then launch all applicable scans.
                </p>
              </div>
              <div>
                <p className="text-sm font-semibold">3. Review results</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Track status in your dashboard and download findings.
                </p>
              </div>
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <Link
                  href={
                    isDevBypass
                      ? "/app"
                      : isAuthed
                        ? "/app"
                        : "/api/auth/signin/github"
                  }
                >
                  {isDevBypass
                    ? "Continue in dev mode"
                    : isAuthed
                      ? "Go to dashboard"
                      : "Get started"}
                </Link>
              </Button>
              <span className="text-sm text-muted-foreground">
                Uses the existing sec-audit worker pipeline.
              </span>
            </div>
          </div>
        </section> */}
      </main>
    </div>
  );
}
