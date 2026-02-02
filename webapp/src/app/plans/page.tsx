import Link from "next/link";
import { Check, Shield, Zap, Building2, HelpCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import AppNav from "@/components/app-nav";
import SignOutButton from "@/components/sign-out-button";
import { getServerAuth } from "@/lib/server-auth";
import { isAdmin } from "@/lib/admin-auth";

export const metadata = {
  title: "Plans & Pricing - SecurityKit",
  description:
    "Simple, transparent pricing for security scanning. Free for open source, affordable for teams."
};

const tiers = [
  {
    name: "Free",
    icon: Shield,
    price: { monthly: "€0", yearly: null },
    description: "Perfect for open source projects and evaluation",
    scansPerMonth: "5",
    cta: "Get started free",
    href: "/app" as const,
    featured: false,
    features: [
      "5 scans per month",
      "Public repositories",
      "All security scanners",
      "Basic reporting",
      "Community support"
    ]
  },
  {
    name: "Pro",
    icon: Zap,
    price: { monthly: "€29", yearly: "€290" },
    description: "For professional developers and small teams",
    scansPerMonth: "50",
    cta: "Start 14-day trial",
    href: "/app" as const,
    featured: true,
    features: [
      "50 scans per month",
      "Public & private repositories",
      "AI-powered analysis",
      "Export reports (PDF/JSON)",
      "Email notifications",
      "Scheduled scans",
      "Priority support"
    ]
  },
  {
    name: "Enterprise",
    icon: Building2,
    price: { monthly: "Custom", yearly: null },
    description: "For organizations with advanced security needs",
    scansPerMonth: "Unlimited",
    cta: "Contact sales",
    href: "/contact" as const,
    featured: false,
    features: [
      "Unlimited scans",
      "Team collaboration",
      "API & CI/CD access",
      "Custom security policies",
      "SSO & advanced auth",
      "SLA guarantee",
      "Dedicated support"
    ]
  }
];

const faqs = [
  {
    question: "What happens when I exceed my scan limit?",
    answer:
      "You'll be notified when you approach your limit. You can upgrade anytime to get more scans, or wait until your monthly quota resets."
  },
  {
    question: "Can I cancel my subscription anytime?",
    answer:
      "Yes, you can cancel or downgrade at any time. Your subscription will remain active until the end of your billing period."
  },
  {
    question: "Do you offer refunds?",
    answer:
      "We offer a 14-day free trial for Pro plans. If you're not satisfied, you can cancel before being charged."
  },
  {
    question: "What's included in the free plan?",
    answer:
      "The free plan includes 5 scans per month on public repositories with access to all our security scanners and basic reporting."
  }
];

export default async function PlansPage() {
  const session = await getServerAuth();
  const userIsAdmin = isAdmin(session?.user?.email);

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
            <AppNav isAdmin={userIsAdmin} />
          </div>
          <div className="flex items-center gap-4">
            {session?.user?.email ? (
              <>
                <div className="hidden text-sm text-slate-500 sm:block">
                  {session.user.email}
                </div>
                <SignOutButton />
              </>
            ) : (
              <Button asChild size="sm">
                <Link href="/api/auth/signin/github?callbackUrl=/plans">
                  Sign in with GitHub
                </Link>
              </Button>
            )}
          </div>
        </div>
      </header>

      <main>
        {/* Hero Section */}
        <section className="bg-white border-b py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
            <Badge className="mb-4 bg-blue-50 text-blue-700 hover:bg-blue-100">
              Simple pricing
            </Badge>
            <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
              Choose your plan
            </h1>
            <p className="mt-4 text-lg text-slate-600 max-w-2xl mx-auto">
              Start free and scale as you grow. All plans include access to our
              full suite of security scanners.
            </p>
          </div>
        </section>

        {/* Pricing Cards */}
        <section className="py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid gap-8 lg:grid-cols-3">
              {tiers.map((tier) => (
                <Card
                  key={tier.name}
                  className={`relative flex flex-col overflow-hidden ${
                    tier.featured
                      ? "border-2 border-blue-600 shadow-xl shadow-blue-100"
                      : "border border-slate-200 shadow-sm"
                  }`}
                >
                  {tier.featured && (
                    <div className="absolute top-0 right-0 bg-blue-600 text-white text-xs font-medium px-3 py-1 rounded-bl-lg">
                      Most popular
                    </div>
                  )}
                  <CardContent className="flex flex-col flex-1 p-6 sm:p-8">
                    {/* Header */}
                    <div className="mb-6">
                      <div
                        className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl ${
                          tier.featured ? "bg-blue-100" : "bg-slate-100"
                        }`}
                      >
                        <tier.icon
                          className={`h-6 w-6 ${
                            tier.featured ? "text-blue-600" : "text-slate-600"
                          }`}
                        />
                      </div>
                      <h2 className="text-xl font-semibold text-slate-900">
                        {tier.name}
                      </h2>
                      <p className="mt-2 text-sm text-slate-500">
                        {tier.description}
                      </p>
                    </div>

                    {/* Price */}
                    <div className="mb-6">
                      <div className="flex items-baseline gap-1">
                        <span className="text-4xl font-bold text-slate-900">
                          {tier.price.monthly}
                        </span>
                        {tier.price.monthly !== "Custom" && (
                          <span className="text-slate-500">/month</span>
                        )}
                      </div>
                      {tier.price.yearly && (
                        <p className="mt-1 text-sm text-slate-500">
                          {tier.price.yearly} billed yearly{" "}
                          <span className="text-emerald-600 font-medium">
                            (Save €58)
                          </span>
                        </p>
                      )}
                      <div className="mt-4 inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                        {tier.scansPerMonth} scans/month
                      </div>
                    </div>

                    {/* CTA */}
                    <Button
                      asChild
                      className={`w-full mb-8 ${
                        tier.featured
                          ? "bg-blue-600 hover:bg-blue-700 text-white"
                          : "bg-slate-900 hover:bg-slate-800 text-white"
                      }`}
                    >
                      <Link href={tier.href}>
                        {tier.cta}
                      </Link>
                    </Button>

                    {/* Features */}
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-900 mb-4">
                        What&apos;s included:
                      </p>
                      <ul className="space-y-3">
                        {tier.features.map((feature) => (
                          <li
                            key={feature}
                            className="flex items-start gap-3 text-sm text-slate-600"
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

            {/* Note */}
            <p className="mt-8 text-center text-sm text-slate-500">
              All prices in EUR. Taxes may apply. Need a custom plan?{" "}
              <Link href="/contact" className="text-blue-600 hover:underline">
                Contact us
              </Link>
            </p>
          </div>
        </section>

        {/* Feature Comparison */}
        <section className="border-t bg-white py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
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
                    <th className="px-6 py-4 text-left font-semibold text-slate-900">
                      Feature
                    </th>
                    <th className="px-6 py-4 text-center font-semibold text-slate-900">
                      Free
                    </th>
                    <th className="px-6 py-4 text-center font-semibold text-slate-900 bg-blue-50/50">
                      Pro
                    </th>
                    <th className="px-6 py-4 text-center font-semibold text-slate-900">
                      Enterprise
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {[
                    { name: "Scans per month", free: "5", pro: "50", enterprise: "Unlimited" },
                    { name: "Public repositories", free: "✓", pro: "✓", enterprise: "✓" },
                    { name: "Private repositories", free: "—", pro: "✓", enterprise: "✓" },
                    { name: "All security scanners", free: "✓", pro: "✓", enterprise: "✓" },
                    { name: "AI analysis", free: "—", pro: "✓", enterprise: "✓" },
                    { name: "PDF/JSON exports", free: "—", pro: "✓", enterprise: "✓" },
                    { name: "Scheduled scans", free: "—", pro: "✓", enterprise: "✓" },
                    { name: "API access", free: "—", pro: "—", enterprise: "✓" },
                    { name: "SSO", free: "—", pro: "—", enterprise: "✓" },
                    { name: "Custom policies", free: "—", pro: "—", enterprise: "✓" },
                    { name: "Support", free: "Community", pro: "Priority", enterprise: "Dedicated" },
                  ].map((row) => (
                    <tr key={row.name} className="hover:bg-slate-50/50">
                      <td className="px-6 py-4 font-medium text-slate-900">
                        {row.name}
                      </td>
                      <td className="px-6 py-4 text-center text-slate-600">
                        {row.free}
                      </td>
                      <td className="px-6 py-4 text-center text-slate-900 bg-blue-50/30 font-medium">
                        {row.pro}
                      </td>
                      <td className="px-6 py-4 text-center text-slate-600">
                        {row.enterprise}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="border-t py-16 sm:py-24">
          <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-2xl font-bold text-slate-900">
                Frequently asked questions
              </h2>
            </div>

            <div className="space-y-4">
              {faqs.map((faq, index) => (
                <Card key={index} className="border-0 shadow-sm">
                  <CardContent className="p-6">
                    <div className="flex gap-4">
                      <HelpCircle className="h-5 w-5 flex-shrink-0 text-blue-600" />
                      <div>
                        <h3 className="font-medium text-slate-900">
                          {faq.question}
                        </h3>
                        <p className="mt-2 text-sm text-slate-600">
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
                <Link href="/contact" className="text-blue-600 hover:underline font-medium">
                  Contact our team
                </Link>
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t bg-white py-12">
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
