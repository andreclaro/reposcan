import Link from "next/link";
import { Shield } from "lucide-react";

import AppNav from "@/components/app-nav";
import { ContactForm } from "@/components/contact-form";
import SignOutButton from "@/components/sign-out-button";
import { Button } from "@/components/ui/button";
import { isAdmin } from "@/lib/admin-auth";
import { getServerAuth } from "@/lib/server-auth";
import { HIDE_PLANS } from "@/lib/config";

export const metadata = {
  title: "Contact - SecureFast",
  description:
    "Get in touch with SecureFast for Custom plans, enterprise, or support."
};

export default async function ContactPage() {
  const session = await getServerAuth();
  const userIsAdmin = isAdmin(session?.user?.email);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header - Matching app layout style */}
      <header className="sticky top-0 z-50 w-full border-b bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900">
                <Shield className="h-5 w-5 text-white" />
              </div>
              <span className="text-lg font-semibold text-slate-900">
                SecureFast
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
                <Link href="/login?callbackUrl=/contact">
                  Sign in with GitHub
                </Link>
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center mb-12">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Contact us
          </h1>
          <p className="mt-4 text-lg text-slate-600">
            Interested in a Custom plan or have questions? Send us a message
            and we&apos;ll get back to you soon.
          </p>
        </div>

        <div className="mx-auto max-w-xl">
          <ContactForm />
        </div>
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
                SecureFast
              </span>
            </div>
            <div className="flex gap-6 text-sm text-slate-500">
              <Link href="/privacy" className="hover:text-slate-900">
                Privacy Policy
              </Link>
              <Link href="/terms" className="hover:text-slate-900">
                Terms of Service
              </Link>
              {!HIDE_PLANS && (
                <Link href="/plans" className="hover:text-slate-900">
                  Plans
                </Link>
              )}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
