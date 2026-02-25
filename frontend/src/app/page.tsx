"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { useSession } from "next-auth/react";
import { HIDE_PLANS } from "@/lib/config";
import {
  ArrowRight,
  CheckCircle2,
  Github,
  Shield,
  Bug,
  Container,
  Package,
  LayoutDashboard,
  Zap,
  ExternalLink,
  Link2,
  Scan,
  FileSearch,
  Sparkles,
  User,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import HeroScanForm from "@/components/hero-scan-form";
import {
  FadeIn,
  SlideInLeft,
  SlideInRight,
  ScaleIn,
  StaggerContainer,
  StaggerItem,
} from "@/components/animated-section";

// Feature data with enhanced descriptions
const features = [
  {
    title: "Find vulnerabilities in your code",
    description:
      "Static analysis catches SQL injection, XSS, hardcoded secrets, and logic flaws before they reach production.",
    icon: Bug,
    color: "text-red-600",
    bgColor: "bg-red-50",
  },
  {
    title: "Secure your infrastructure",
    description:
      "Scan Dockerfiles and Infrastructure-as-Code for misconfigurations that could expose your systems.",
    icon: Container,
    color: "text-indigo-600",
    bgColor: "bg-indigo-50",
  },
  {
    title: "Track vulnerable dependencies",
    description:
      "Automatically detect outdated packages with known CVEs across Node.js, Go, Python, and Rust ecosystems.",
    icon: Package,
    color: "text-violet-600",
    bgColor: "bg-violet-50",
  },
  {
    title: "Unified security dashboard",
    description:
      "One scan, one report. See all findings organized by severity with AI-powered remediation guidance.",
    icon: LayoutDashboard,
    color: "text-blue-600",
    bgColor: "bg-blue-50",
  },
];

// How it works steps
const howItWorks = [
  {
    step: "01",
    title: "Connect",
    description: "Link your GitHub repository in seconds. No complex setup required.",
    icon: Link2,
    details: ["Authenticate with GitHub", "Select your repository", "Choose your branch"],
  },
  {
    step: "02",
    title: "Scan",
    description: "Our engine runs 10+ security tools in parallel against your codebase.",
    icon: Scan,
    details: ["SAST & secrets scanning", "Dependency vulnerability check", "Container & IaC analysis"],
  },
  {
    step: "03",
    title: "Fix",
    description: "Review prioritized findings with AI-generated fix suggestions.",
    icon: FileSearch,
    details: ["AI-powered security analysis", "Prioritized recommendations", "Code-level remediation"],
  },
];

// Animation variants
const fadeInUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { duration: 0.6, ease: [0.25, 0.1, 0.25, 1] as const }
  },
};

const fadeIn = {
  hidden: { opacity: 0 },
  visible: { 
    opacity: 1,
    transition: { duration: 0.6, ease: [0.25, 0.1, 0.25, 1] as const }
  },
};

const staggerContainer = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const staggerItem = {
  hidden: { opacity: 0, y: 20 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { duration: 0.5, ease: [0.25, 0.1, 0.25, 1] as const }
  },
};

const slideInLeft = {
  hidden: { opacity: 0, x: -50 },
  visible: { 
    opacity: 1, 
    x: 0,
    transition: { duration: 0.6, ease: [0.25, 0.1, 0.25, 1] as const }
  },
};

const slideInRight = {
  hidden: { opacity: 0, x: 50 },
  visible: { 
    opacity: 1, 
    x: 0,
    transition: { duration: 0.6, ease: [0.25, 0.1, 0.25, 1] as const }
  },
};

export default function HomePage() {
  const { data: session, status } = useSession();
  const isAuthenticated = status === "authenticated";

  return (
    <div className="relative min-h-screen">
      {/* Navigation */}
      <motion.header 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="sticky top-0 z-50 w-full border-b bg-white/80 backdrop-blur-md"
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900">
              <Shield className="h-5 w-5 text-white" />
            </div>
            <span className="text-lg font-semibold text-slate-900">
              RepoScan
            </span>
          </Link>
          <nav className="hidden items-center gap-8 md:flex">
            <Link
              href="#features"
              className="text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              Features
            </Link>
            <Link
              href="#how-it-works"
              className="text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              How it works
            </Link>
            {!HIDE_PLANS && (
              <Link
                href="/plans"
                className="text-sm font-medium text-slate-600 hover:text-slate-900"
              >
                Plans
              </Link>
            )}
          </nav>
          <div className="flex items-center gap-3">
            {isAuthenticated ? (
              <>
                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  className="hidden sm:inline-flex gap-2"
                >
                  <Link href="/app">
                    <User className="h-4 w-4" />
                    {session?.user?.email?.split("@")[0] || "Account"}
                  </Link>
                </Button>
                <Button asChild size="sm">
                  <Link href="/app" className="gap-2">
                    <LayoutDashboard className="h-4 w-4" />
                    Open dashboard
                  </Link>
                </Button>
              </>
            ) : (
              <>
                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  className="hidden sm:inline-flex"
                >
                  <Link href="/login">Sign in</Link>
                </Button>
                <Button asChild size="sm">
                  <Link
                    href="/login?callbackUrl=/app"
                    className="gap-2"
                  >
                    <Github className="h-4 w-4" />
                    Get Started
                  </Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </motion.header>

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-b from-slate-50 to-white pb-16 pt-20 sm:pb-24 sm:pt-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-2 lg:gap-8 items-center">
            {/* Left Content */}
            <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
              >
                <Badge
                  variant="secondary"
                  className="mb-6 w-fit gap-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  AI-Powered Analysis
                </Badge>
              </motion.div>
              
              <motion.h1 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="max-w-3xl text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl"
              >
                Ship code with{" "}
                <span className="text-blue-600">confidence</span>
              </motion.h1>
              
              <motion.p 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.3 }}
                className="mt-6 max-w-2xl text-lg text-slate-600"
              >
                Catch vulnerabilities before they reach production. Automated
                security scanning for your code, dependencies, containers, and
                infrastructure — all in one unified platform.
              </motion.p>

              {/* Scan Form */}
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.4 }}
                className="mt-10 w-full max-w-3xl"
              >
                <HeroScanForm isAuthed={isAuthenticated} />
              </motion.div>

              {/* Social Proof */}
              <motion.p 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.5 }}
                className="mt-6 text-sm text-slate-500"
              >
                Free forever for public repositories. No credit card required.
              </motion.p>
            </div>

            {/* Right Content - Hero Illustration */}
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.7, delay: 0.3 }}
              className="relative flex items-center justify-center lg:justify-end"
            >
              <div className="relative w-full max-w-lg">
                <div className="absolute -inset-4 rounded-3xl bg-gradient-to-r from-blue-100 to-indigo-100 opacity-50 blur-2xl" />
                <Image
                  src="/illustrations/hero-illustration.svg"
                  alt="Security scanning visualization"
                  width={600}
                  height={450}
                  className="relative rounded-2xl"
                  priority
                />
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Stats Bar */}
      {/* <motion.section 
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-100px" }}
        variants={staggerContainer}
        className="border-y bg-white"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 gap-8 py-8 md:grid-cols-4">
            {[
              { value: "10M+", label: "Vulnerabilities found" },
              { value: "50K+", label: "Repositories scanned" },
              { value: "99.9%", label: "Uptime guaranteed" },
              { value: "5 min", label: "Average scan time" },
            ].map((stat) => (
              <motion.div 
                key={stat.label} 
                variants={staggerItem}
                className="text-center"
              >
                <div className="text-2xl font-bold text-slate-900 sm:text-3xl">
                  {stat.value}
                </div>
                <div className="mt-1 text-sm text-slate-500">{stat.label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.section> */}

      {/* Features Grid */}
      <section id="features" className="bg-slate-50 py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <FadeIn className="text-center">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              Comprehensive security coverage
            </h2>
            <p className="mt-4 text-lg text-slate-600">
              One platform, multiple scanners. We run the best open-source
              security tools so you don&apos;t have to.
            </p>
          </FadeIn>

          <motion.div 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={staggerContainer}
            className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4"
          >
            {features.map((feature) => (
              <motion.div key={feature.title} variants={staggerItem}>
                <Card className="group relative overflow-hidden border-0 bg-white shadow-sm transition-shadow hover:shadow-md h-full">
                  <CardContent className="p-6">
                    <div
                      className={`mb-4 flex h-12 w-12 items-center justify-center rounded-xl ${feature.bgColor}`}
                    >
                      <feature.icon className={`h-6 w-6 ${feature.color}`} />
                    </div>
                    <h3 className="text-lg font-semibold text-slate-900">
                      {feature.title}
                    </h3>
                    <p className="mt-2 text-sm text-slate-600">
                      {feature.description}
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="bg-white py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <FadeIn className="text-center">
            <Badge className="mb-4 bg-blue-50 text-blue-700 hover:bg-blue-100">
              Simple workflow
            </Badge>
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              How it works
            </h2>
            <p className="mt-4 text-lg text-slate-600">
              Get your first security scan in under 5 minutes
            </p>
          </FadeIn>

          <div className="mt-16 grid gap-8 lg:grid-cols-3">
            {howItWorks.map((step, index) => (
              <motion.div
                key={step.step}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.5, delay: index * 0.15 }}
              >
                <Card className="relative overflow-hidden border-0 bg-slate-50 shadow-none h-full">
                  {/* Step Number Background */}
                  <div className="absolute -right-4 -top-4 text-8xl font-bold text-slate-100/50">
                    {step.step}
                  </div>
                  
                  <CardContent className="relative p-8">
                    {/* Step Badge */}
                    <div className="mb-6 flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-200">
                        <step.icon className="h-6 w-6" />
                      </div>
                      <Badge variant="secondary" className="text-xs font-medium">
                        Step {step.step}
                      </Badge>
                    </div>

                    <h3 className="text-xl font-semibold text-slate-900">
                      {step.title}
                    </h3>
                    <p className="mt-2 text-slate-600">
                      {step.description}
                    </p>

                    {/* Details List */}
                    <ul className="mt-6 space-y-3">
                      {step.details.map((detail, idx) => (
                        <li key={idx} className="flex items-center gap-3 text-sm text-slate-600">
                          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-100">
                            <CheckCircle2 className="h-3 w-3 text-blue-600" />
                          </div>
                          {detail}
                        </li>
                      ))}
                    </ul>
                  </CardContent>

                  {/* Connector Line (hidden on last item and mobile) */}
                  {index < howItWorks.length - 1 && (
                    <div className="hidden lg:block absolute top-1/2 -right-4 w-8">
                      <ArrowRight className="h-6 w-6 text-slate-300" />
                    </div>
                  )}
                </Card>
              </motion.div>
            ))}
          </div>

          {/* Bottom CTA */}
          <FadeIn delay={0.3} className="mt-12 text-center">
            <Button asChild size="lg" className="h-12 px-8">
              <Link
                href={isAuthenticated ? "/app" : "/login?callbackUrl=/app"}
                className="gap-2"
              >
                {isAuthenticated ? "Open dashboard" : "Try it now"}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </FadeIn>
        </div>
      </section>

      {/* AI Analysis Feature */}
      <section className="bg-slate-900 py-20 sm:py-28 overflow-hidden">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-2 items-center">
            <SlideInLeft>
              <Badge className="mb-4 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20">
                Coming soon to Pro tier
              </Badge>
              <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                AI-powered security analysis
              </h2>
              <p className="mt-4 text-lg text-slate-300">
                Our AI engine analyzes scan results to provide actionable
                insights. Get prioritized recommendations and understand the
                real impact of each vulnerability.
              </p>
              <motion.ul 
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={staggerContainer}
                className="mt-8 space-y-4"
              >
                {[
                  "Executive summary generation",
                  "Prioritized fix recommendations",
                  "Effort estimation for remediation",
                ].map((item) => (
                  <motion.li 
                    key={item} 
                    variants={staggerItem}
                    className="flex items-center gap-3"
                  >
                    <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                    <span className="text-slate-300">{item}</span>
                  </motion.li>
                ))}
              </motion.ul>
            </SlideInLeft>
            
            <SlideInRight>
              <div className="relative rounded-2xl bg-slate-800 p-8">
                <div className="space-y-4">
                  <div className="rounded-xl bg-slate-900/50 p-4">
                    <p className="text-sm font-medium text-slate-300">
                      Executive Summary
                    </p>
                    <p className="mt-2 text-sm text-slate-400">
                      This scan identified 12 vulnerabilities across 3 severity
                      levels. The critical SQL injection in user-auth.js requires
                      immediate attention...
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-900/50 p-4">
                    <p className="text-sm font-medium text-slate-300 mb-2">
                      Top Findings
                    </p>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="w-2 h-2 rounded-full bg-red-400" />
                        <span className="text-slate-300">SQL Injection</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="w-2 h-2 rounded-full bg-orange-400" />
                        <span className="text-slate-300">Hardcoded Secret</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="w-2 h-2 rounded-full bg-yellow-400" />
                        <span className="text-slate-300">Outdated Dependency</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </SlideInRight>
          </div>
        </div>
      </section>

      {/* Plans CTA */}
      <section className="bg-white py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <ScaleIn>
            <div className="rounded-3xl bg-gradient-to-br from-blue-600 to-indigo-700 px-6 py-16 text-center sm:px-16 sm:py-20">
              <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                Ready to secure your code?
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-lg text-blue-100">
                Start scanning for free. Upgrade when you need more scans or
                advanced features.
              </p>
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.2 }}
                className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row"
              >
                <Button
                  asChild
                  size="lg"
                  className="h-12 bg-white px-8 text-base text-blue-600 hover:bg-blue-50"
                >
                  <Link
                    href={isAuthenticated ? "/app" : "/login?callbackUrl=/app"}
                    className="gap-2"
                  >
                    {isAuthenticated ? "Open dashboard" : "Start scanning for free"}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                {!HIDE_PLANS && (
                  <Button
                    asChild
                    size="lg"
                    className="h-12 border-2 border-white bg-transparent px-8 text-base text-white hover:bg-white/10"
                  >
                    <Link href="/plans">View plans</Link>
                  </Button>
                )}
              </motion.div>
              <p className="mt-6 text-sm text-blue-200">
                No credit card required. 5 free scans per month.
              </p>
            </div>
          </ScaleIn>
        </div>
      </section>

      {/* Footer */}
      <motion.footer 
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="border-t bg-slate-50"
      >
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid gap-8 md:grid-cols-3">
            <div className="space-y-4">
              <Link href="/" className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900">
                  <Shield className="h-5 w-5 text-white" />
                </div>
                <span className="text-lg font-semibold text-slate-900">
                  RepoScan
                </span>
              </Link>
              <p className="text-sm text-slate-500">
                Automated security scanning for modern development teams.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-slate-900">Product</h4>
              <ul className="mt-4 space-y-2 text-sm">
                <li>
                  <Link
                    href="#features"
                    className="text-slate-500 hover:text-slate-900"
                  >
                    Features
                  </Link>
                </li>
                {!HIDE_PLANS && (
                  <li>
                    <Link
                      href="/plans"
                      className="text-slate-500 hover:text-slate-900"
                    >
                      Plans
                    </Link>
                  </li>
                )}
                <li>
                  <Link
                    href="/app"
                    className="text-slate-500 hover:text-slate-900"
                  >
                    Dashboard
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-slate-900">Legal</h4>
              <ul className="mt-4 space-y-2 text-sm">
                <li>
                  <Link
                    href="/contact"
                    className="text-slate-500 hover:text-slate-900"
                  >
                    Contact
                  </Link>
                </li>
                <li>
                  <Link
                    href="/privacy"
                    className="text-slate-500 hover:text-slate-900"
                  >
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link
                    href="/terms"
                    className="text-slate-500 hover:text-slate-900"
                  >
                    Terms of Service
                  </Link>
                </li>
              </ul>
            </div>
          </div>
          <Separator className="my-8" />
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <p className="text-sm text-slate-500">
              © {new Date().getFullYear()} RepoScan. All rights reserved.
            </p>
            <p className="text-sm text-slate-500">
              Built with security in mind.
            </p>
          </div>
        </div>
      </motion.footer>
    </div>
  );
}
