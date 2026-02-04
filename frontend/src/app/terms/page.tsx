import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";

export const metadata = {
  title: "Terms of Service - SecurityKit",
  description: "Terms of Service for SecurityKit automated security scanning service."
};

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-sm font-semibold">
            SecurityKit
          </Link>
          <Button asChild variant="ghost" size="sm">
            <Link href="/">
              <ArrowLeft className="size-4" />
              Back to Home
            </Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-12">
        <article className="prose prose-neutral dark:prose-invert max-w-none">
          <h1>Terms of Service</h1>
          <p className="lead">
            Last updated: January 2025
          </p>

          <p>
            Please read these Terms of Service (&quot;Terms&quot;, &quot;Terms of Service&quot;) carefully
            before using the SecurityKit service operated by SecurityKit (&quot;us&quot;, &quot;we&quot;, or &quot;our&quot;).
          </p>

          <h2>1. Acceptance of Terms</h2>
          <p>
            By accessing or using our service, you agree to be bound by these Terms. If you
            disagree with any part of the terms, you may not access the service.
          </p>

          <h2>2. Description of Service</h2>
          <p>
            SecurityKit provides automated security scanning services for software repositories.
            Our service analyzes source code, dependencies, container configurations, and
            infrastructure-as-code to identify potential security vulnerabilities and provide
            remediation guidance.
          </p>

          <h2>3. Account Registration</h2>

          <h3>3.1 Account Creation</h3>
          <p>
            To use our service, you must authenticate using a valid GitHub account. By
            authenticating, you grant us permission to access your GitHub profile information
            as described in our Privacy Policy.
          </p>

          <h3>3.2 Account Responsibilities</h3>
          <p>
            You are responsible for:
          </p>
          <ul>
            <li>Maintaining the security of your GitHub account credentials</li>
            <li>All activities that occur under your account</li>
            <li>Notifying us immediately of any unauthorized use of your account</li>
          </ul>

          <h2>4. Acceptable Use</h2>

          <h3>4.1 Permitted Use</h3>
          <p>
            You may use our service to:
          </p>
          <ul>
            <li>Scan repositories you own or have authorization to scan</li>
            <li>Review security findings and implement recommended fixes</li>
            <li>Export scan results for your own records</li>
          </ul>

          <h3>4.2 Prohibited Use</h3>
          <p>
            You agree NOT to:
          </p>
          <ul>
            <li>Scan repositories without proper authorization from the repository owner</li>
            <li>Use scan results to exploit vulnerabilities in systems you do not own</li>
            <li>Attempt to bypass security measures or rate limits</li>
            <li>Use the service for any illegal or unauthorized purpose</li>
            <li>Interfere with or disrupt the service or servers</li>
            <li>Reverse engineer, decompile, or disassemble any part of our service</li>
            <li>Share, sell, or redistribute scan results without authorization</li>
            <li>Use automated means to access the service beyond provided APIs</li>
          </ul>

          <h2>5. Repository Authorization</h2>
          <p>
            By submitting a repository URL for scanning, you represent and warrant that:
          </p>
          <ul>
            <li>You own the repository, or</li>
            <li>You have explicit authorization from the repository owner to perform security scans, or</li>
            <li>The repository is publicly accessible and scanning does not violate its license terms</li>
          </ul>
          <p>
            We reserve the right to refuse scanning any repository and to terminate accounts
            that violate this provision.
          </p>

          <h2>6. Intellectual Property</h2>

          <h3>6.1 Our Property</h3>
          <p>
            The service, including its original content, features, and functionality, is owned
            by SecurityKit and is protected by international copyright, trademark, and other
            intellectual property laws.
          </p>

          <h3>6.2 Your Content</h3>
          <p>
            You retain all rights to your repositories and code. We do not claim any ownership
            rights over the content you scan. You grant us a limited, temporary license to
            access and process your repositories solely for the purpose of performing security scans.
          </p>

          <h2>7. Disclaimer of Warranties</h2>
          <p>
            THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND,
            EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO:
          </p>
          <ul>
            <li>WARRANTIES OF MERCHANTABILITY</li>
            <li>FITNESS FOR A PARTICULAR PURPOSE</li>
            <li>NON-INFRINGEMENT</li>
            <li>ACCURACY OR COMPLETENESS OF SCAN RESULTS</li>
          </ul>
          <p>
            <strong>Disclaimer:</strong> Scan results are for informational purposes only and are not
            guaranteed for accuracy. Use at your own risk. We are not liable for any actions taken
            based on these results.
          </p>
          <p>
            We do not warrant that:
          </p>
          <ul>
            <li>The service will be uninterrupted, secure, or error-free</li>
            <li>Scan results will identify all security vulnerabilities</li>
            <li>Any errors will be corrected</li>
          </ul>

          <h2>8. Limitation of Liability</h2>
          <p>
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, IN NO EVENT SHALL SECURITYKIT BE LIABLE FOR:
          </p>
          <ul>
            <li>Any indirect, incidental, special, consequential, or punitive damages</li>
            <li>Loss of profits, data, use, goodwill, or other intangible losses</li>
            <li>Security breaches or vulnerabilities not detected by our service</li>
            <li>Actions taken based on scan results</li>
          </ul>
          <p>
            Our total liability for any claims arising from or related to these Terms or the
            service shall not exceed the amount you paid us, if any, during the twelve (12)
            months preceding the claim.
          </p>

          <h2>9. Indemnification</h2>
          <p>
            You agree to defend, indemnify, and hold harmless SecurityKit and its officers,
            directors, employees, and agents from any claims, damages, losses, or expenses
            (including reasonable attorneys&apos; fees) arising from:
          </p>
          <ul>
            <li>Your use of the service</li>
            <li>Your violation of these Terms</li>
            <li>Your violation of any third-party rights</li>
            <li>Unauthorized scanning of repositories</li>
          </ul>

          <h2>10. Service Modifications</h2>
          <p>
            We reserve the right to:
          </p>
          <ul>
            <li>Modify or discontinue the service at any time</li>
            <li>Change features, functionality, or pricing</li>
            <li>Impose limits on certain features or access</li>
          </ul>
          <p>
            We will make reasonable efforts to provide notice of significant changes.
          </p>

          <h2>11. Termination</h2>
          <p>
            We may terminate or suspend your account and access to the service immediately,
            without prior notice, for any reason, including breach of these Terms.
          </p>
          <p>
            Upon termination:
          </p>
          <ul>
            <li>Your right to use the service will cease immediately</li>
            <li>We may delete your account data and scan results</li>
            <li>Provisions that by their nature should survive will remain in effect</li>
          </ul>

          <h2>12. Governing Law</h2>
          <p>
            These Terms shall be governed by and construed in accordance with the laws of
            the jurisdiction in which SecurityKit operates, without regard to conflict of
            law provisions.
          </p>

          <h2>13. Dispute Resolution</h2>
          <p>
            Any disputes arising from these Terms or the service shall first be attempted
            to be resolved through good-faith negotiation. If negotiation fails, disputes
            shall be resolved through binding arbitration in accordance with applicable
            arbitration rules.
          </p>

          <h2>14. Severability</h2>
          <p>
            If any provision of these Terms is found to be unenforceable or invalid, that
            provision shall be limited or eliminated to the minimum extent necessary, and
            the remaining provisions shall remain in full force and effect.
          </p>

          <h2>15. Entire Agreement</h2>
          <p>
            These Terms, together with our Privacy Policy, constitute the entire agreement
            between you and SecurityKit regarding the service and supersede any prior
            agreements.
          </p>

          <h2>16. Changes to Terms</h2>
          <p>
            We reserve the right to modify these Terms at any time. We will provide notice
            of material changes by posting the updated Terms on this page and updating the
            &quot;Last updated&quot; date. Your continued use of the service after changes
            constitutes acceptance of the modified Terms.
          </p>

          <h2>17. Contact Information</h2>
          <p>
            For questions about these Terms, please contact us at:
          </p>
          <ul>
            <li>Email: legal@securitykit.io</li>
          </ul>
        </article>
      </main>

      <footer className="border-t py-8">
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
