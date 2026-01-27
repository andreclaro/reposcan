import { NextResponse } from "next/server";
import { db } from "@/db";
import { findings } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getServerAuth } from "@/lib/server-auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ scanId: string; findingId: string }> }
) {
  const session = await getServerAuth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { scanId, findingId } = await params;
  const findingIdNum = parseInt(findingId);

  if (isNaN(findingIdNum)) {
    return NextResponse.json(
      { error: "Invalid finding ID" },
      { status: 400 }
    );
  }

  try {
    // Verify scan belongs to user
    const { scans } = await import("@/db/schema");
    const scan = await db
      .select()
      .from(scans)
      .where(and(eq(scans.scanId, scanId), eq(scans.userId, session.user.id)))
      .limit(1);

    if (scan.length === 0) {
      return NextResponse.json(
        { error: "Scan not found" },
        { status: 404 }
      );
    }

    // Verify finding belongs to scan
    const finding = await db
      .select()
      .from(findings)
      .where(and(eq(findings.id, findingIdNum), eq(findings.scanId, scanId)))
      .limit(1);

    if (finding.length === 0) {
      return NextResponse.json(
        { error: "Finding not found" },
        { status: 404 }
      );
    }

    const findingData = finding[0];

    // Build comprehensive analysis from stored data
    const analysis = {
      finding: {
        id: findingData.id,
        title: findingData.title,
        description: findingData.description,
        severity: findingData.severity,
        category: findingData.category,
        filePath: findingData.filePath,
        lineStart: findingData.lineStart,
        lineEnd: findingData.lineEnd,
        codeSnippet: findingData.codeSnippet,
        cwe: findingData.cwe,
        cve: findingData.cve,
        remediation: findingData.remediation,
        scanner: findingData.scanner,
        confidence: findingData.confidence,
        metadata: findingData.metadata,
      },
      analysis: null as any,
    };

    // Generate detailed analysis from stored data
    if (findingData.codeSnippet || findingData.description) {
      // Build analysis text
      let analysisText = findingData.description || `Security finding detected by ${findingData.scanner}`;
      
      // Add CWE/CVE information
      if (findingData.cwe) {
        analysisText += `\n\n**CWE Reference:** ${findingData.cwe}`;
      }
      if (findingData.cve) {
        analysisText += `\n\n**CVE Reference:** ${findingData.cve}`;
      }

      // Add code context if available
      if (findingData.codeSnippet) {
        analysisText += `\n\n**Vulnerable Code:**\n\`\`\`\n${findingData.codeSnippet}\n\`\`\``;
      }

      // Build exploit scenario
      let exploitScenario = "";
      if (findingData.category) {
        const categoryExploits: Record<string, string> = {
          injection: "An attacker could inject malicious code or commands that would be executed by the application.",
          xss: "An attacker could inject malicious scripts that execute in users' browsers, potentially stealing session tokens or performing actions on behalf of users.",
          auth: "An attacker could bypass authentication or gain unauthorized access to protected resources.",
          crypto: "Weak cryptographic implementations could allow attackers to decrypt sensitive data or forge authentication tokens.",
          secrets: "Exposed secrets could allow attackers to gain unauthorized access to external services or internal systems.",
          rce: "An attacker could execute arbitrary code on the server, potentially gaining full system control.",
          ssrf: "An attacker could make the server send requests to internal services, potentially accessing private resources.",
          idor: "An attacker could access or modify resources belonging to other users by manipulating resource identifiers.",
        };
        exploitScenario = categoryExploits[findingData.category] || "The vulnerability could be exploited to compromise the security of the application.";
      } else {
        exploitScenario = "The vulnerability could be exploited depending on the specific context and implementation.";
      }

      if (findingData.filePath && findingData.lineStart) {
        exploitScenario += ` The issue is located in ${findingData.filePath} at line ${findingData.lineStart}.`;
      }

      // Build remediation guidance
      let remediationCode = findingData.remediation || "";
      if (!remediationCode && findingData.codeSnippet) {
        remediationCode = `Review and fix the vulnerable code in ${findingData.filePath || 'the identified file'}.`;
        if (findingData.cwe) {
          remediationCode += ` Refer to CWE-${findingData.cwe.split('-')[1]} for remediation guidance.`;
        }
      }

      // Build additional notes
      const additionalNotes: string[] = [];
      if (findingData.scanner) {
        additionalNotes.push(`Detected by: ${findingData.scanner}`);
      }
      if (findingData.confidence) {
        additionalNotes.push(`Confidence: ${findingData.confidence}`);
      }
      if (findingData.metadata) {
        const metadata = findingData.metadata as Record<string, any>;
        if (metadata.rule_id) {
          additionalNotes.push(`Rule ID: ${metadata.rule_id}`);
        }
        if (metadata.package_name) {
          additionalNotes.push(`Package: ${metadata.package_name}`);
          if (metadata.package_version) {
            additionalNotes.push(`Version: ${metadata.package_version}`);
          }
        }
      }

      analysis.analysis = {
        analysis: analysisText,
        exploit_scenario: exploitScenario,
        remediation_code: remediationCode,
        additional_notes: additionalNotes.length > 0 
          ? additionalNotes.join('\n')
          : "For detailed AI-powered code analysis with full repository context, enable AI_ANALYSIS_ENABLED during scan execution.",
      };
    }

    return NextResponse.json({
      ...analysis,
      note: "This analysis is generated from stored finding data. For detailed AI-powered code analysis with full repository context and surrounding code, enable AI_ANALYSIS_ENABLED=true during scan execution. The scan worker will perform deep code analysis during the scan when the repository is available.",
    });
  } catch (error) {
    console.error("Error fetching finding analysis:", error);
    return NextResponse.json(
      { error: "Failed to fetch finding analysis" },
      { status: 500 }
    );
  }
}
