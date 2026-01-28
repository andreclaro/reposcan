import type { Metadata } from "next";

import Providers from "@/app/providers";
import { getServerAuth } from "@/lib/server-auth";

import "./globals.css";

export const metadata: Metadata = {
  title: "SecurityKit",
  description: "Security Scan Automation for GitHub Repositories."
};

export default async function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const session = await getServerAuth();

  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground">
        <Providers session={session}>{children}</Providers>
      </body>
    </html>
  );
}
