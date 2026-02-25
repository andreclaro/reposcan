import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";

export const metadata = {
  title: "Privacy Policy - RepoScan",
  description: "Privacy Policy for RepoScan automated security scanning service."
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-sm font-semibold">
            RepoScan
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
          <h1>Privacy Policy</h1>
          <p className="lead">
            Last updated: January 2025
          </p>

          <p>
            RepoScan (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) is committed to protecting your privacy.
            This Privacy Policy explains how we collect, use, disclose, and safeguard your information
            when you use our automated security scanning service.
          </p>

          <h2>1. Information We Collect</h2>

          <h3>1.1 Account Information</h3>
          <p>
            When you sign in using GitHub OAuth, we collect:
          </p>
          <ul>
            <li>Your GitHub username and email address</li>
            <li>Your GitHub profile picture (if available)</li>
            <li>OAuth tokens necessary to authenticate your requests</li>
          </ul>

          <h3>1.2 Repository Data</h3>
          <p>
            When you initiate a security scan, we temporarily access:
          </p>
          <ul>
            <li>Repository URLs you provide for scanning</li>
            <li>Repository source code (temporarily cloned during scan execution)</li>
            <li>Commit hashes and branch information</li>
            <li>Dependency manifests (package.json, go.mod, Cargo.toml, etc.)</li>
            <li>Configuration files (Dockerfiles, Terraform files, etc.)</li>
          </ul>

          <h3>1.3 Scan Results</h3>
          <p>
            We store scan results including:
          </p>
          <ul>
            <li>Security findings and vulnerabilities detected</li>
            <li>Severity classifications and remediation suggestions</li>
            <li>Code snippets relevant to identified issues</li>
            <li>Scan metadata (timestamps, progress, status)</li>
          </ul>

          <h3>1.4 Usage Information</h3>
          <p>
            We automatically collect:
          </p>
          <ul>
            <li>Browser type and version</li>
            <li>IP address</li>
            <li>Pages visited and features used</li>
            <li>Time and date of visits</li>
          </ul>

          <h2>2. How We Use Your Information</h2>
          <p>
            We use the collected information to:
          </p>
          <ul>
            <li>Provide and maintain our security scanning service</li>
            <li>Authenticate your identity and manage your account</li>
            <li>Execute security scans on repositories you specify</li>
            <li>Generate and store security reports for your review</li>
            <li>Improve our scanning algorithms and service quality</li>
            <li>Send service-related notifications</li>
            <li>Respond to your inquiries and support requests</li>
            <li>Detect and prevent fraudulent or unauthorized use</li>
          </ul>

          <h2>3. Data Retention</h2>

          <h3>3.1 Repository Source Code</h3>
          <p>
            Repository source code is cloned temporarily during scan execution and is
            automatically deleted immediately after the scan completes. We do not
            retain copies of your source code beyond the scanning process.
          </p>

          <h3>3.2 Scan Results</h3>
          <p>
            Scan results and findings are retained for as long as your account is active
            or as needed to provide you with our services. You may request deletion of
            specific scans at any time through the dashboard.
          </p>

          <h3>3.3 Account Data</h3>
          <p>
            Account information is retained until you delete your account or request
            removal of your data.
          </p>

          <h2>4. Data Sharing and Disclosure</h2>
          <p>
            We do not sell, trade, or rent your personal information to third parties.
            We may share information only in the following circumstances:
          </p>
          <ul>
            <li>
              <strong>Service Providers:</strong> With third-party vendors who assist
              in operating our service (e.g., cloud hosting providers), subject to
              confidentiality obligations.
            </li>
            <li>
              <strong>Legal Requirements:</strong> When required by law or to respond
              to legal process, protect our rights, or ensure user safety.
            </li>
            <li>
              <strong>Business Transfers:</strong> In connection with a merger,
              acquisition, or sale of assets, with appropriate confidentiality protections.
            </li>
          </ul>

          <h2>5. Data Security</h2>
          <p>
            We implement appropriate technical and organizational security measures to
            protect your information, including:
          </p>
          <ul>
            <li>Encryption of data in transit using TLS/SSL</li>
            <li>Encryption of sensitive data at rest</li>
            <li>Regular security assessments and updates</li>
            <li>Access controls and authentication requirements</li>
            <li>Secure deletion of temporary files after processing</li>
          </ul>

          <h2>6. Your Rights and Choices</h2>
          <p>
            You have the right to:
          </p>
          <ul>
            <li>Access your personal information</li>
            <li>Correct inaccurate data</li>
            <li>Delete your account and associated data</li>
            <li>Export your scan results</li>
            <li>Revoke OAuth access through GitHub settings</li>
          </ul>

          <h2>7. Third-Party Services</h2>
          <p>
            Our service integrates with third-party tools and services:
          </p>
          <ul>
            <li>
              <strong>GitHub:</strong> For authentication and repository access.
              GitHub&apos;s privacy policy applies to data collected by GitHub.
            </li>
            <li>
              <strong>Security Scanners:</strong> We use industry-standard security
              scanning tools (Semgrep, Trivy, etc.) that process repository data locally
              within our infrastructure.
            </li>
          </ul>

          <h2>8. International Data Transfers</h2>
          <p>
            Your information may be transferred to and processed in countries other
            than your country of residence. We ensure appropriate safeguards are in
            place to protect your information in compliance with applicable laws.
          </p>

          <h2>9. Children&apos;s Privacy</h2>
          <p>
            Our service is not directed to individuals under the age of 16. We do not
            knowingly collect personal information from children. If we become aware
            that we have collected data from a child, we will take steps to delete
            such information.
          </p>

          <h2>10. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. We will notify you
            of any material changes by posting the new policy on this page and updating
            the &quot;Last updated&quot; date.
          </p>

          <h2>11. Contact Us</h2>
          <p>
            If you have questions about this Privacy Policy or our data practices,
            please contact us at:
          </p>
          <ul>
            <li>Email: privacy@securitykit.io</li>
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
