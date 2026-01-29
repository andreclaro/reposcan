import { NextResponse } from "next/server";
import { db } from "@/db";
import { findings } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getServerAuth } from "@/lib/server-auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ scanId: string }> }
) {
  const session = await getServerAuth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { scanId } = await params;
  const { searchParams } = new URL(request.url);

  // Query parameters for filtering
  const severity = searchParams.get("severity");
  const category = searchParams.get("category");
  const scanner = searchParams.get("scanner");
  const limit = parseInt(searchParams.get("limit") || "100");
  const offset = parseInt(searchParams.get("offset") || "0");

  // #region agent log
  const logData = {scanId,severity,category,scanner,limit,offset,userId:session?.user?.id};
  console.log('[DEBUG API] API START', logData);
  await fetch('http://127.0.0.1:7250/ingest/c11ddcde-3020-4ad3-907a-65bf86ca8a32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'findings/route.ts:18',message:'API START',data:logData,timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
  // #endregion

  try {
    // Verify scan belongs to user
    const { scans } = await import("@/db/schema");
    const scan = await db
      .select()
      .from(scans)
      .where(and(eq(scans.scanId, scanId), eq(scans.userId, session.user.id)))
      .limit(1);

    // #region agent log
    console.log('[DEBUG API] API scan check', {scanFound: scan.length > 0, scanId, scan: scan[0]});
    await fetch('http://127.0.0.1:7250/ingest/c11ddcde-3020-4ad3-907a-65bf86ca8a32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'findings/route.ts:35',message:'API scan check',data:{scanFound:scan.length>0,scanId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion

    if (scan.length === 0) {
      // #region agent log
      await fetch('http://127.0.0.1:7250/ingest/c11ddcde-3020-4ad3-907a-65bf86ca8a32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'findings/route.ts:38',message:'API scan NOT FOUND',data:{scanId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      return NextResponse.json(
        { error: "Scan not found" },
        { status: 404 }
      );
    }

    // Build query conditions
    const conditions = [eq(findings.scanId, scanId)];

    if (severity) {
      conditions.push(eq(findings.severity, severity));
    }
    if (category) {
      conditions.push(eq(findings.category, category));
    }
    if (scanner) {
      conditions.push(eq(findings.scanner, scanner));
    }

    // Fetch findings
    const findingsList = await db
      .select()
      .from(findings)
      .where(and(...conditions))
      .limit(limit)
      .offset(offset);

    // #region agent log
    console.log('[DEBUG API] API findings query result', {findingsCount: findingsList.length, conditionsCount: conditions.length, findingsList: findingsList.slice(0, 2)});
    await fetch('http://127.0.0.1:7250/ingest/c11ddcde-3020-4ad3-907a-65bf86ca8a32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'findings/route.ts:62',message:'API findings query result',data:{findingsCount:findingsList.length,conditionsCount:conditions.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion

    // Get summary statistics
    const allFindings = await db
      .select()
      .from(findings)
      .where(eq(findings.scanId, scanId));

    // #region agent log
    console.log('[DEBUG API] API allFindings query result', {allFindingsCount: allFindings.length});
    await fetch('http://127.0.0.1:7250/ingest/c11ddcde-3020-4ad3-907a-65bf86ca8a32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'findings/route.ts:68',message:'API allFindings query result',data:{allFindingsCount:allFindings.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion

    const summary = {
      total: allFindings.length,
      by_severity: {
        critical: allFindings.filter((f) => f.severity === "critical").length,
        high: allFindings.filter((f) => f.severity === "high").length,
        medium: allFindings.filter((f) => f.severity === "medium").length,
        low: allFindings.filter((f) => f.severity === "low").length,
        info: allFindings.filter((f) => f.severity === "info").length,
      },
      by_category: allFindings.reduce(
        (acc, f) => {
          const cat = f.category || "unknown";
          acc[cat] = (acc[cat] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      ),
      by_scanner: allFindings.reduce(
        (acc, f) => {
          acc[f.scanner] = (acc[f.scanner] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      ),
    };

    const responseData = {
      findings: findingsList,
      summary,
      pagination: {
        limit,
        offset,
        total: allFindings.length,
      },
    };
    // #region agent log
    console.log('[DEBUG API] API RESPONSE', {findingsCount: findingsList.length, summaryTotal: summary.total, responseKeys: Object.keys(responseData), summary});
    await fetch('http://127.0.0.1:7250/ingest/c11ddcde-3020-4ad3-907a-65bf86ca8a32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'findings/route.ts:96',message:'API RESPONSE',data:{findingsCount:findingsList.length,summaryTotal:summary.total,responseKeys:Object.keys(responseData)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    return NextResponse.json(responseData);
  } catch (error) {
    // #region agent log
    console.error('[DEBUG API] API ERROR', {errorMsg: error instanceof Error ? error.message : String(error), error});
    await fetch('http://127.0.0.1:7250/ingest/c11ddcde-3020-4ad3-907a-65bf86ca8a32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'findings/route.ts:105',message:'API ERROR',data:{error:error instanceof Error?error.message:String(error)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
    // #endregion
    console.error("Error fetching findings:", error);
    return NextResponse.json(
      { error: "Failed to fetch findings" },
      { status: 500 }
    );
  }
}
