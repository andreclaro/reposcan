import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";

import Providers from "@/app/providers";
import { getServerAuth } from "@/lib/server-auth";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SecurityKit - Ship Code with Confidence",
  icons: {
    icon: "/icon.svg",
  },
  description:
    "Automated security scanning for GitHub repositories. Catch vulnerabilities in your code, dependencies, and infrastructure before they reach production.",
  keywords: [
    "security scanning",
    "SAST",
    "vulnerability detection",
    "code security",
    "DevSecOps",
    "GitHub security",
  ],
  authors: [{ name: "SecurityKit" }],
  openGraph: {
    title: "SecurityKit - Ship Code with Confidence",
    description:
      "Automated security scanning for GitHub repositories. Catch vulnerabilities before they reach production.",
    type: "website",
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerAuth();

  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-screen bg-background text-foreground font-sans antialiased">
        <Providers session={session}>{children}</Providers>
      </body>
    </html>
  );
}
