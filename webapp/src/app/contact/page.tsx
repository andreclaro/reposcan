import Link from "next/link";

import AppNav from "@/components/app-nav";
import { ContactForm } from "@/components/contact-form";
import SignOutButton from "@/components/sign-out-button";
import { Button } from "@/components/ui/button";
import { isAdmin } from "@/lib/admin-auth";
import { getServerAuth } from "@/lib/server-auth";

export const metadata = {
  title: "Contact - SecurityKit",
  description:
    "Get in touch with SecurityKit for Custom plans, enterprise, or support."
};

export default async function ContactPage() {
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
                <Link href="/api/auth/signin/github?callbackUrl=/contact">
                  Sign in with GitHub
                </Link>
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold tracking-tight">Contact us</h1>
          <p className="mt-2 text-muted-foreground max-w-xl mx-auto">
            Interested in a Custom plan or have questions? Send us a message
            and we&apos;ll get back to you soon.
          </p>
        </div>

        <ContactForm />
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
            <Link href="/pricing" className="hover:text-foreground">
              Pricing
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
