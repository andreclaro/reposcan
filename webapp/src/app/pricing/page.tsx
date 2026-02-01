import Link from "next/link";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import AppNav from "@/components/app-nav";
import SignOutButton from "@/components/sign-out-button";
import { getServerAuth } from "@/lib/server-auth";
import { isAdmin } from "@/lib/admin-auth";

export const metadata = {
  title: "Pricing - SecurityKit",
  description:
    "SecurityKit pricing: Free, Pro, and Custom tiers for automated security scanning."
};

const tiers: Array<{
  name: string;
  price: { monthly: string; yearly: string | null };
  description: string;
  scansPerMonth: string;
  cta: string;
  href: "/app" | "contact";
  featured: boolean;
  features: string[];
}> = [
  {
    name: "Free",
    price: { monthly: "€0", yearly: null },
    description: "Open source developers, evaluation",
    scansPerMonth: "5",
    cta: "Get started",
    href: "/app",
    featured: false,
    features: [
      "5 scans per month",
      "Public repositories",
      "Community support"
    ]
  },
  {
    name: "Pro",
    price: { monthly: "€29", yearly: "€290" },
    description: "Individual developers, freelancers",
    scansPerMonth: "50",
    cta: "Start 14-day trial",
    href: "/app",
    featured: true,
    features: [
      "50 scans per month",
      "Public & private repositories",
      "Export reports (PDF/JSON)",
      "Email notifications",
      "Scheduled scans",
      "Priority support"
    ]
  },
  {
    name: "Custom",
    price: { monthly: "From €500", yearly: "Custom" },
    description: "Enterprise, agencies",
    scansPerMonth: "Unlimited",
    cta: "Contact us",
    href: "contact",
    featured: false,
    features: [
      "Unlimited scans",
      "Team collaboration",
      "API & CI/CD access",
      "Custom policies",
      "Dedicated support"
    ]
  }
];

export default async function PricingPage() {
  const session = await getServerAuth();
  const userIsAdmin = isAdmin(session?.user?.email);

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-6">
            <Link href="/" className="text-sm font-semibold">
              SecurityKit
            </Link>
            <AppNav isAdmin={userIsAdmin} />
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            {session?.user?.email ? (
              <>
                <span>{session.user.email}</span>
                <SignOutButton />
              </>
            ) : (
              <Button asChild variant="ghost" size="sm">
                <Link href="/api/auth/signin/github?callbackUrl=/pricing">
                  Sign in with GitHub
                </Link>
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="text-center mb-12">
          <h1 className="text-3xl font-bold tracking-tight">Pricing</h1>
          <p className="mt-2 text-muted-foreground">
            Choose the plan that fits your team. Upgrade or downgrade anytime.
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-3">
          {tiers.map((tier) => (
            <div
              key={tier.name}
              className={`relative rounded-xl border p-6 ${
                tier.featured
                  ? "border-primary shadow-lg ring-2 ring-primary/20"
                  : "border-border"
              }`}
            >
              {tier.featured && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-xs font-medium text-primary-foreground">
                  Most popular
                </span>
              )}
              <div className="mb-4">
                <h2 className="text-lg font-semibold">{tier.name}</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {tier.description}
                </p>
              </div>
              <div className="mb-4">
                <span className="text-2xl font-bold">{tier.price.monthly}</span>
                <span className="text-muted-foreground">/month</span>
                {tier.price.yearly && (
                  <p className="text-sm text-muted-foreground mt-1">
                    {tier.price.yearly} yearly
                  </p>
                )}
              </div>
              <ul className="space-y-2 mb-6">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm">
                    <Check className="size-4 shrink-0 text-primary" />
                    {f}
                  </li>
                ))}
              </ul>
              <Button
                asChild
                variant={tier.featured ? "default" : "outline"}
                className="w-full"
              >
                <Link href={tier.href === "contact" ? "/contact" : tier.href}>
                  {tier.cta}
                </Link>
              </Button>
            </div>
          ))}
        </div>

        <p className="mt-8 text-center text-sm text-muted-foreground">
          Pro yearly saves €58. No credit card required for 14-day trial.
        </p>
      </main>

      <footer className="border-t py-8 mt-12">
        <div className="mx-auto max-w-4xl px-6 text-center text-sm text-muted-foreground">
          <div className="flex justify-center gap-6">
            <Link href="/privacy" className="hover:text-foreground">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:text-foreground">
              Terms of Service
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
