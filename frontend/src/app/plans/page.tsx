"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { HIDE_PLANS } from "@/lib/config";
import {
  Check,
  Shield,
  Zap,
  Building2,
  HelpCircle,
  Sparkles,
  Lock,
  Users,
  Clock,
  ArrowRight,
  User,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";

interface Tier {
  name: string;
  icon: React.ElementType;
  price: { monthly: number | null; yearly: number | null };
  description: string;
  scansPerMonth: string;
  cta: string;
  href: "/app" | "/contact";
  featured: boolean;
  features: string[];
  notIncluded?: string[];
  savings?: string;
}

const baseTiers: Tier[] = [
  {
    name: "Free",
    icon: Shield,
    price: { monthly: 0, yearly: 0 },
    description: "Perfect for open source projects and evaluation",
    scansPerMonth: "5",
    cta: "Get started free",
    href: "/app",
    featured: false,
    features: [
      "5 scans per month",
      "Public repositories only",
      "Basic security scanners",
      "Basic reporting",
      "Community support",
    ],
    notIncluded: [
      "AI-powered analysis",
      "PDF/JSON exports",
      "Scheduled scans",
    ],
  },
  {
    name: "Pro",
    icon: Zap,
    price: { monthly: 29, yearly: 290 },
    description: "For professional developers and small teams",
    scansPerMonth: "50",
    cta: "Start 14-day free trial",
    href: "/app",
    featured: true,
    features: [
      "50 scans per month",
      "Public & private repositories",
      "All security scanners",
      "AI access",
      "Export reports (PDF/JSON)",
      "Email notifications",
      "Scheduled scans",
      "Priority support",
    ],
    savings: "Save €58",
  },
  {
    name: "Enterprise",
    icon: Building2,
    price: { monthly: null, yearly: null },
    description: "For organizations with advanced security needs",
    scansPerMonth: "Unlimited",
    cta: "Contact sales",
    href: "/contact",
    featured: false,
    features: [
      "Unlimited scans",
      "Team collaboration",
      "API & CI/CD access",
      "Custom security policies",
      "SSO & advanced auth",
      "SLA guarantee",
      "Dedicated support",
    ],
  },
];

const faqs = [
  {
    question: "What happens when I exceed my scan limit?",
    answer:
      "You'll be notified when you approach your limit. You can upgrade anytime to get more scans, or wait until your monthly quota resets.",
  },
  {
    question: "Can I cancel my subscription anytime?",
    answer:
      "Yes, you can cancel or downgrade at any time. Your subscription will remain active until the end of your billing period.",
  },
  {
    question: "Do you offer refunds?",
    answer:
      "We offer a 14-day free trial for Pro plans. If you're not satisfied, you can cancel before being charged.",
  },
  {
    question: "What's included in the free plan?",
    answer:
      "The free plan includes 5 scans per month on public repositories with access to basic security scanners and basic reporting.",
  },
];

const trustBadges = [
  { icon: Clock, text: "14-day free trial" },
  { icon: Lock, text: "Cancel anytime" },
  { icon: Users, text: "No credit card required" },
];

export default function PlansPage() {
  const [isYearly, setIsYearly] = useState(true);
  const [proPlan, setProPlan] = useState<{
    monthlyPrice: number | null;
    yearlyPrice: number | null;
    scansPerMonth: number | null;
    trialDays: number | null;
  } | null>(null);
  const { data: session, status } = useSession();
  const isAuthenticated = status === "authenticated";
  const router = useRouter();

  // Redirect if plans are hidden
  useEffect(() => {
    if (HIDE_PLANS) {
      router.replace("/");
    }
  }, [router]);

  useEffect(() => {
    let isActive = true;

    const loadProPlan = async () => {
      try {
        const response = await fetch("/api/plans", { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as {
          plans?: Array<{
            name: string;
            codename: string;
            monthlyPrice: number | null;
            yearlyPrice: number | null;
            scansPerMonth: number | null;
            trialDays: number | null;
          }>;
        };
        if (!isActive || !payload.plans?.length) return;
        const plan =
          payload.plans.find((p) => p.codename === "pro") ??
          payload.plans.find((p) => p.name.toLowerCase() === "pro");
        if (!plan) return;
        setProPlan({
          monthlyPrice: plan.monthlyPrice,
          yearlyPrice: plan.yearlyPrice,
          scansPerMonth: plan.scansPerMonth,
          trialDays: plan.trialDays
        });
      } catch {
        // Ignore errors; fallback values will render instead
      }
    };

    loadProPlan();
    return () => {
      isActive = false;
    };
  }, []);

  // Show nothing while redirecting
  if (HIDE_PLANS) {
    return null;
  }

  const proScansPerMonth =
    proPlan?.scansPerMonth === -1
      ? "Unlimited"
      : proPlan?.scansPerMonth
        ? String(proPlan.scansPerMonth)
        : "50";

  const tiers = baseTiers.map((tier) => {
    if (tier.name !== "Pro") return tier;

    const monthly = proPlan?.monthlyPrice ?? tier.price.monthly;
    const yearly = proPlan?.yearlyPrice ?? tier.price.yearly;

    return {
      ...tier,
      price: { monthly, yearly },
      scansPerMonth: proScansPerMonth,
      features: [
        `${proScansPerMonth} scans per month`,
        ...tier.features.filter((feature) => !feature.includes("scans per month"))
      ],
      cta:
        proPlan?.trialDays && proPlan.trialDays > 0
          ? `Start ${proPlan.trialDays}-day free trial`
          : tier.cta,
    };
  });

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900">
                <Shield className="h-5 w-5 text-white" />
              </div>
              <span className="text-lg font-semibold text-slate-900">
                SecurityKit
              </span>
            </Link>
          </div>
          <div className="flex items-center gap-4">
            {isAuthenticated ? (
              <Button asChild variant="ghost" size="sm" className="gap-2">
                <Link href="/app">
                  <User className="h-4 w-4" />
                  Dashboard
                </Link>
              </Button>
            ) : (
              <Button asChild variant="ghost" size="sm">
                <Link href="/login">Sign in</Link>
              </Button>
            )}
          </div>
        </div>
      </header>

      <main>
        {/* Hero Section */}
        <section className="bg-white border-b py-12 sm:py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
            <Badge className="mb-4 bg-blue-50 text-blue-700 hover:bg-blue-100 border-0">
              <Sparkles className="w-3 h-3 mr-1" />
              Simple, transparent pricing
            </Badge>
            <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
              Choose your plan
            </h1>
            <p className="mt-4 text-lg text-slate-600 max-w-2xl mx-auto">
              Start free and scale as you grow. Free includes basic scanners;
              Pro unlocks the full scanner suite and AI access.
            </p>

            {/* Billing Toggle */}
            <div className="mt-8 flex items-center justify-center gap-3">
              <span
                className={`text-sm font-medium ${
                  !isYearly ? "text-slate-900" : "text-slate-500"
                }`}
              >
                Monthly
              </span>
              <Switch
                checked={isYearly}
                onCheckedChange={setIsYearly}
                className="data-[state=checked]:bg-blue-600"
              />
              <span
                className={`text-sm font-medium ${
                  isYearly ? "text-slate-900" : "text-slate-500"
                }`}
              >
                Yearly
              </span>
              <Badge
                variant="secondary"
                className="ml-2 bg-emerald-100 text-emerald-700 border-0"
              >
                Save 17%
              </Badge>
            </div>
          </div>
        </section>

        {/* Pricing Cards */}
        <section className="py-12 sm:py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid gap-6 lg:grid-cols-3 lg:gap-8">
              {tiers.map((tier) => (
                <Card
                  key={tier.name}
                  className={`relative flex flex-col h-full ${
                    tier.featured
                      ? "border-2 border-blue-600 shadow-2xl shadow-blue-100 scale-105 z-10"
                      : "border border-slate-200 shadow-sm hover:shadow-md transition-shadow"
                  }`}
                >
                  {tier.featured && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                      <Badge className="bg-blue-600 text-white border-0 px-3 py-1 text-xs font-semibold">
                        Most popular
                      </Badge>
                    </div>
                  )}
                  <CardContent className="flex flex-col flex-1 p-6">
                    {/* Header */}
                    <div className="mb-5">
                      <div
                        className={`mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg ${
                          tier.featured
                            ? "bg-blue-100 text-blue-600"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        <tier.icon className="h-5 w-5" />
                      </div>
                      <h2 className="text-lg font-semibold text-slate-900">
                        {tier.name}
                      </h2>
                      <p className="mt-1 text-sm text-slate-500">
                        {tier.description}
                      </p>
                    </div>

                    {/* Price */}
                    <div className="mb-5">
                      <div className="flex items-baseline gap-1">
                        {tier.price.monthly === null ? (
                          <span className="text-3xl font-bold text-slate-900">
                            Custom
                          </span>
                        ) : (
                          <>
                            <span className="text-3xl font-bold text-slate-900">
                              €
                              {isYearly && tier.price.yearly !== null
                                ? Math.round(tier.price.yearly / 12)
                                : tier.price.monthly}
                            </span>
                            <span className="text-slate-500">/month</span>
                          </>
                        )}
                      </div>
                      {tier.featured &&
                        isYearly &&
                        tier.price.yearly !== null &&
                        tier.price.monthly !== null && (
                        <p className="mt-1 text-sm text-slate-500">
                          <span className="line-through text-slate-400">
                            €{tier.price.monthly * 12} yearly
                          </span>
                          <span className="ml-1 text-emerald-600 font-medium">
                            €{tier.price.yearly} billed yearly
                          </span>
                        </p>
                      )}
                      {tier.featured && !isYearly && (
                        <p className="mt-1 text-sm text-slate-500">
                          Billed monthly
                        </p>
                      )}
                      <div className="mt-3 inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                        {tier.scansPerMonth} scans/month
                      </div>
                    </div>

                    {/* CTA */}
                    <Button
                      asChild
                      className={`w-full mb-5 ${
                        tier.featured
                          ? "bg-blue-600 hover:bg-blue-700 text-white"
                          : "bg-slate-900 hover:bg-slate-800 text-white"
                      }`}
                    >
                      <Link href={tier.href}>
                        {tier.cta}
                        {tier.featured && (
                          <ArrowRight className="ml-2 h-4 w-4" />
                        )}
                      </Link>
                    </Button>

                    {/* Features */}
                    <div className="flex-1">
                      <p className="text-xs font-semibold text-slate-900 uppercase tracking-wide mb-3">
                        What&apos;s included:
                      </p>
                      <ul className="space-y-2.5">
                        {tier.features.map((feature) => (
                          <li
                            key={feature}
                            className="flex items-start gap-2.5 text-sm text-slate-600"
                          >
                            <Check
                              className={`mt-0.5 h-4 w-4 flex-shrink-0 ${
                                tier.featured
                                  ? "text-blue-600"
                                  : "text-emerald-600"
                              }`}
                            />
                            <span>{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Trust Badges */}
            <div className="mt-10 flex flex-wrap items-center justify-center gap-6">
              {trustBadges.map((badge) => (
                <div
                  key={badge.text}
                  className="flex items-center gap-2 text-sm text-slate-500"
                >
                  <badge.icon className="h-4 w-4 text-slate-400" />
                  <span>{badge.text}</span>
                </div>
              ))}
            </div>

            {/* Note */}
            <p className="mt-6 text-center text-sm text-slate-500">
              All prices in EUR. Taxes may apply. Need a custom plan?{" "}
              <Link href="/contact" className="text-blue-600 hover:underline">
                Contact us
              </Link>
            </p>
          </div>
        </section>

        {/* Feature Comparison */}
        <section className="border-t bg-white py-12 sm:py-16">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-10">
              <h2 className="text-2xl font-bold text-slate-900">
                Compare plans
              </h2>
              <p className="mt-2 text-slate-600">
                All plans include core security scanning features
              </p>
            </div>

            <div className="overflow-hidden rounded-xl border">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-4 text-left font-semibold text-slate-900 w-2/5">
                      Feature
                    </th>
                    <th className="px-4 py-4 text-center font-semibold text-slate-900">
                      Free
                    </th>
                    <th className="px-4 py-4 text-center font-semibold text-slate-900 bg-blue-50/50">
                      Pro
                    </th>
                    <th className="px-4 py-4 text-center font-semibold text-slate-900">
                      Enterprise
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {[
                    {
                      name: "Scans per month",
                      free: "5",
                      pro: proScansPerMonth,
                      enterprise: "Unlimited",
                    },
                    {
                      name: "Public repositories",
                      free: "✓",
                      pro: "✓",
                      enterprise: "✓",
                    },
                    {
                      name: "Private repositories",
                      free: "—",
                      pro: "✓",
                      enterprise: "✓",
                    },
                    {
                      name: "All security scanners",
                      free: "—",
                      pro: "✓",
                      enterprise: "✓",
                    },
                    {
                      name: "Basic security scanners",
                      free: "✓",
                      pro: "✓",
                      enterprise: "✓",
                    },
                    {
                      name: "AI analysis",
                      free: "—",
                      pro: "✓",
                      enterprise: "✓",
                    },
                    {
                      name: "PDF/JSON exports",
                      free: "—",
                      pro: "✓",
                      enterprise: "✓",
                    },
                    {
                      name: "Scheduled scans",
                      free: "—",
                      pro: "✓",
                      enterprise: "✓",
                    },
                    {
                      name: "Email notifications",
                      free: "—",
                      pro: "✓",
                      enterprise: "✓",
                    },
                    {
                      name: "API access",
                      free: "—",
                      pro: "—",
                      enterprise: "✓",
                    },
                    {
                      name: "SSO / SAML",
                      free: "—",
                      pro: "—",
                      enterprise: "✓",
                    },
                    {
                      name: "Custom policies",
                      free: "—",
                      pro: "—",
                      enterprise: "✓",
                    },
                    {
                      name: "Support",
                      free: "Community",
                      pro: "Priority",
                      enterprise: "Dedicated",
                    },
                  ].map((row) => (
                    <tr key={row.name} className="hover:bg-slate-50/50">
                      <td className="px-6 py-3.5 font-medium text-slate-900">
                        {row.name}
                      </td>
                      <td className="px-4 py-3.5 text-center text-slate-600">
                        {row.free === "✓" ? (
                          <Check className="h-4 w-4 text-emerald-600 mx-auto" />
                        ) : row.free === "—" ? (
                          <span className="text-slate-300">—</span>
                        ) : (
                          row.free
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-center text-slate-900 bg-blue-50/30 font-medium">
                        {row.pro === "✓" ? (
                          <Check className="h-4 w-4 text-blue-600 mx-auto" />
                        ) : row.pro === "—" ? (
                          <span className="text-slate-300">—</span>
                        ) : (
                          row.pro
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-center text-slate-600">
                        {row.enterprise === "✓" ? (
                          <Check className="h-4 w-4 text-emerald-600 mx-auto" />
                        ) : row.enterprise === "—" ? (
                          <span className="text-slate-300">—</span>
                        ) : (
                          row.enterprise
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="border-t py-12 sm:py-16">
          <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-10">
              <h2 className="text-2xl font-bold text-slate-900">
                Frequently asked questions
              </h2>
            </div>

            <div className="space-y-3">
              {faqs.map((faq, index) => (
                <Card key={index} className="border-0 shadow-sm">
                  <CardContent className="p-5">
                    <div className="flex gap-4">
                      <HelpCircle className="h-5 w-5 flex-shrink-0 text-blue-600" />
                      <div>
                        <h3 className="font-medium text-slate-900">
                          {faq.question}
                        </h3>
                        <p className="mt-1.5 text-sm text-slate-600">
                          {faq.answer}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="mt-8 text-center">
              <p className="text-slate-600">
                Have more questions?{" "}
                <Link
                  href="/contact"
                  className="text-blue-600 hover:underline font-medium"
                >
                  Contact our team
                </Link>
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t bg-white py-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded bg-slate-900">
                <Shield className="h-3.5 w-3.5 text-white" />
              </div>
              <span className="text-sm font-semibold text-slate-900">
                SecurityKit
              </span>
            </div>
            <div className="flex gap-6 text-sm text-slate-500">
              <Link href="/privacy" className="hover:text-slate-900">
                Privacy Policy
              </Link>
              <Link href="/terms" className="hover:text-slate-900">
                Terms of Service
              </Link>
              <Link href="/contact" className="hover:text-slate-900">
                Contact
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
