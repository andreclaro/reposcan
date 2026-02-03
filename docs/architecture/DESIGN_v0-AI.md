# Security Audit SaaS - AI Integration Design Document

## Executive Summary

This document extends the base architecture (DESIGN_v0.md) with AI-powered analysis capabilities. The AI integration provides:

1. **Intelligent Findings Normalization**: Convert raw scanner outputs into structured, queryable findings
2. **AI-Powered Summarization**: Generate executive summaries and prioritized recommendations
3. **Deep Code Analysis**: Analyze source code context for critical vulnerabilities (similar to Cursor/Claude Code)
4. **Hybrid Storage Strategy**: Store queryable data in PostgreSQL, large artifacts in S3

**Key Architecture Decision**: **Hybrid Storage** - Normalized findings and AI summaries in PostgreSQL for queryability, raw scanner outputs and large analysis files in S3 for cost-effectiveness.

## AI Integration Architecture Overview

### Enhanced Pipeline Flow

```
┌─────────────────────────────────────────────────────────────────┐
│         Celery Worker (Repository-Scoped Pipeline)              │
│                                                                  │
│  1. Clone Repo                                                   │
│  2. Detect Languages                                             │
│  3. Run Security Scans (SAST, Docker, Terraform, etc.)          │
│  4. Normalize Findings → Structured JSON                         │
│  5. Store Findings in PostgreSQL                                │
│  6. Upload Raw Outputs to S3                                    │
│  7. AI Analysis Service                                          │
│     ├─ Generate Executive Summary                               │
│     ├─ Prioritize Findings                                      │
│     └─ Deep Code Analysis (for critical findings)              │
│  8. Store AI Results in PostgreSQL + S3                         │
│  9. Cleanup                                                      │
└─────────────────────────────────────────────────────────────────┘
```

### AI Analysis Service Components

```
┌─────────────────────────────────────────────────────────────────┐
│                    AI Analysis Service                          │
│  ┌──────────────────┐  ┌──────────────────┐                  │
│  │ Findings         │  │ Code Analyzer     │                  │
│  │ Normalizer       │  │ (Cursor-style)    │                  │
│  │                  │  │                   │                  │
│  │ - Parse Semgrep  │  │ - Read source     │                  │
│  │ - Parse Trivy    │  │ - Analyze context │                  │
│  │ - Parse npm/go   │  │ - Control flow    │                  │
│  │ - Normalize      │  │ - Remediation     │                  │
│  └────────┬─────────┘  └────────┬─────────┘                  │
│           │                      │                              │
│           └──────────┬───────────┘                              │
│                      │                                          │
│           ┌──────────▼──────────┐                              │
│           │  LLM Integration     │                              │
│           │                      │                              │
│           │  - Anthropic Claude  │                              │
│           │  - OpenAI GPT-4      │                              │
│           │  - Local LLM (opt)   │                              │
│           └──────────┬──────────┘                              │
│                      │                                          │
│           ┌──────────▼──────────┐                              │
│           │  Summary Generator   │                              │
│           │                      │                              │
│           │  - Executive summary │                              │
│           │  - Recommendations  │                              │
│           │  - Risk scoring      │                              │
│           └─────────────────────┘                              │
└─────────────────────────────────────────────────────────────────┘
```

## Data Storage Strategy

### Hybrid Storage Approach

**PostgreSQL (Queryable, Relational)**
- ✅ Normalized findings (one row per finding)
- ✅ AI summaries and recommendations
- ✅ Aggregated statistics
- ✅ Scan metadata
- ✅ Fast queries for dashboards and reports

**S3-Compatible Storage (Large Files, Cost-Effective)**
- ✅ Raw scanner outputs (semgrep.json, trivy.txt, etc.)
- ✅ Full code snippets (if > 500 chars)
- ✅ Complete AI analysis JSON (if > 100KB)
- ✅ Historical scan artifacts

### Storage Structure

```
PostgreSQL Tables:
├── scans (existing + new fields)
├── findings (new - normalized findings)
└── ai_analysis (new - AI summaries)

S3 Bucket Structure:
scans/
  {scan_id}/
    raw/
      semgrep.json
      semgrep.txt
      trivy_dockerfile_scan.txt
      node_audit.txt
      go_vulncheck.txt
      rust_audit.txt
      tfsec.txt
      checkov.txt
      tflint.txt
    findings.json (normalized, if > 100KB)
    ai_analysis_full.json (if > 100KB)
```

## Database Schema

### Extended Schema (Drizzle ORM)

```typescript
// Add to frontend/src/db/schema.ts

import {
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  index
} from "drizzle-orm/pg-core";

// Findings table - normalized, queryable
export const findings = pgTable(
  "finding",
  {
    id: serial("id").primaryKey(),
    scanId: text("scan_id")
      .notNull()
      .references(() => scans.scanId, { onDelete: "cascade" }),
    scanner: text("scanner").notNull(), // 'semgrep', 'trivy', 'npm', 'govulncheck', 'cargo-audit', 'tfsec', 'checkov', 'tflint'
    severity: text("severity").notNull(), // 'critical', 'high', 'medium', 'low', 'info'
    category: text("category"), // 'injection', 'xss', 'auth', 'crypto', 'dependency', 'config', 'secrets'
    title: text("title").notNull(),
    description: text("description"),
    filePath: text("file_path"),
    lineStart: integer("line_start"),
    lineEnd: integer("line_end"),
    codeSnippet: text("code_snippet"), // First 500 chars only (full code in S3 if needed)
    cwe: text("cwe"), // CWE-79
    cve: text("cve"), // CVE-2024-1234
    remediation: text("remediation"),
    confidence: text("confidence"), // 'high', 'medium', 'low'
    metadata: jsonb("metadata").$type<Record<string, unknown>>(), // Tool-specific data (rule_id, package_name, etc.)
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow()
  },
  (table) => ({
    scanIdIdx: index("idx_findings_scan_id").on(table.scanId),
    severityIdx: index("idx_findings_severity").on(table.severity),
    categoryIdx: index("idx_findings_category").on(table.category),
    scannerIdx: index("idx_findings_scanner").on(table.scanner),
    cweIdx: index("idx_findings_cwe").on(table.cwe),
    cveIdx: index("idx_findings_cve").on(table.cve)
  })
);

// AI Analysis table
export const aiAnalysis = pgTable("ai_analysis", {
  id: serial("id").primaryKey(),
  scanId: text("scan_id")
    .unique()
    .notNull()
    .references(() => scans.scanId, { onDelete: "cascade" }),
  summary: text("summary").notNull(), // Executive summary (markdown)
  recommendations: jsonb("recommendations").$type<
    Array<{
      priority: "critical" | "high" | "medium" | "low";
      action: string;
      findingIds: number[]; // References to finding.id
      estimatedEffort: "low" | "medium" | "high";
    }>
  >(),
  riskScore: integer("risk_score"), // 0-100 overall risk score
  topFindings: jsonb("top_findings").$type<number[]>(), // Finding IDs for top 10 critical issues
  model: text("model"), // 'claude-3-opus', 'gpt-4', 'claude-3-sonnet', etc.
  modelVersion: text("model_version"), // API version used
  tokensUsed: integer("tokens_used"), // For cost tracking
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow()
});

// Update scans table
export const scans = pgTable("scan", {
  id: serial("id").primaryKey(),
  scanId: text("scan_id").unique().notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  repoUrl: text("repo_url").notNull(),
  branch: text("branch").default("main"),
  commitHash: text("commit_hash"),
  auditTypes: jsonb("audit_types").$type<string[] | null>().default(null),
  status: text("status").notNull().default("queued"),
  progress: integer("progress").default(0),
  resultsPath: text("results_path"), // Local filesystem path (dev)
  s3ResultsPath: text("s3_results_path"), // s3://bucket/scans/{scan_id}/ (prod)
  result: jsonb("result").$type<Record<string, unknown> | null>().default(null),
  
  // New fields for findings summary
  findingsCount: integer("findings_count").default(0),
  criticalCount: integer("critical_count").default(0),
  highCount: integer("high_count").default(0),
  mediumCount: integer("medium_count").default(0),
  lowCount: integer("low_count").default(0),
  infoCount: integer("info_count").default(0),
  
  // AI analysis reference
  aiAnalysisId: integer("ai_analysis_id").references(() => aiAnalysis.id),
  
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow()
});
```

### Database Migration

```sql
-- Migration: Add findings and AI analysis tables

-- Findings table
CREATE TABLE finding (
  id SERIAL PRIMARY KEY,
  scan_id TEXT NOT NULL REFERENCES scan(scan_id) ON DELETE CASCADE,
  scanner TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
  category TEXT,
  title TEXT NOT NULL,
  description TEXT,
  file_path TEXT,
  line_start INTEGER,
  line_end INTEGER,
  code_snippet TEXT,
  cwe TEXT,
  cve TEXT,
  remediation TEXT,
  confidence TEXT CHECK (confidence IN ('high', 'medium', 'low')),
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_findings_scan_id ON finding(scan_id);
CREATE INDEX idx_findings_severity ON finding(severity);
CREATE INDEX idx_findings_category ON finding(category);
CREATE INDEX idx_findings_scanner ON finding(scanner);
CREATE INDEX idx_findings_cwe ON finding(cwe) WHERE cwe IS NOT NULL;
CREATE INDEX idx_findings_cve ON finding(cve) WHERE cve IS NOT NULL;

-- AI Analysis table
CREATE TABLE ai_analysis (
  id SERIAL PRIMARY KEY,
  scan_id TEXT UNIQUE NOT NULL REFERENCES scan(scan_id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  recommendations JSONB,
  risk_score INTEGER CHECK (risk_score >= 0 AND risk_score <= 100),
  top_findings JSONB,
  model TEXT,
  model_version TEXT,
  tokens_used INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Update scans table
ALTER TABLE scan ADD COLUMN findings_count INTEGER DEFAULT 0;
ALTER TABLE scan ADD COLUMN critical_count INTEGER DEFAULT 0;
ALTER TABLE scan ADD COLUMN high_count INTEGER DEFAULT 0;
ALTER TABLE scan ADD COLUMN medium_count INTEGER DEFAULT 0;
ALTER TABLE scan ADD COLUMN low_count INTEGER DEFAULT 0;
ALTER TABLE scan ADD COLUMN info_count INTEGER DEFAULT 0;
ALTER TABLE scan ADD COLUMN ai_analysis_id INTEGER REFERENCES ai_analysis(id);
ALTER TABLE scan ADD COLUMN s3_results_path TEXT;
```

## Findings Normalization

### Structured Findings Format

Each finding follows a normalized schema regardless of source scanner:

```typescript
interface Finding {
  id?: number; // Auto-generated by DB
  scanId: string;
  scanner: 'semgrep' | 'trivy' | 'npm' | 'govulncheck' | 'cargo-audit' | 'tfsec' | 'checkov' | 'tflint';
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category: 'injection' | 'xss' | 'auth' | 'crypto' | 'dependency' | 'config' | 'secrets' | 'rce' | 'ssrf' | 'idor';
  title: string;
  description: string;
  filePath?: string;
  lineStart?: number;
  lineEnd?: number;
  codeSnippet?: string; // Max 500 chars
  cwe?: string; // CWE-79
  cve?: string; // CVE-2024-1234
  remediation?: string;
  confidence: 'high' | 'medium' | 'low';
  metadata: {
    ruleId?: string;
    packageName?: string;
    packageVersion?: string;
    [key: string]: unknown;
  };
}
```

### Scanner-Specific Parsers

Each scanner output needs a parser to normalize to the common format:

1. **Semgrep Parser**: Parse `semgrep.json` → findings
2. **Trivy Parser**: Parse `trivy_dockerfile_scan.txt` → findings
3. **npm Audit Parser**: Parse `node_audit.txt` → findings
4. **govulncheck Parser**: Parse `go_vulncheck.txt` → findings
5. **cargo-audit Parser**: Parse `rust_audit.txt` → findings
6. **Terraform Parsers**: Parse `tfsec.txt`, `checkov.txt` → findings

## AI Analysis Pipeline

### Step 1: Findings Normalization

After all scanners complete, normalize all outputs:

```python
# sec_audit/ai/normalizer.py

from pathlib import Path
from typing import List
from .parsers import (
    parse_semgrep,
    parse_trivy,
    parse_npm_audit,
    parse_govulncheck,
    parse_cargo_audit,
    parse_tfsec,
    parse_checkov,
)

def normalize_findings(results_dir: Path) -> List[Finding]:
    """Normalize all scanner outputs into structured findings."""
    findings = []
    
    # Parse Semgrep
    semgrep_json = results_dir / "semgrep.json"
    if semgrep_json.exists():
        findings.extend(parse_semgrep(semgrep_json))
    
    # Parse Trivy
    trivy_txt = results_dir / "trivy_dockerfile_scan.txt"
    if trivy_txt.exists():
        findings.extend(parse_trivy(trivy_txt))
    
    # Parse dependency audits
    # ... (npm, go, rust)
    
    # Parse Terraform
    # ... (tfsec, checkov)
    
    return findings
```

### Step 2: Store Findings in PostgreSQL

```python
# sec_audit/ai/storage.py

import asyncpg
from typing import List
from .models import Finding

async def store_findings(
    conn: asyncpg.Connection,
    scan_id: str,
    findings: List[Finding]
) -> dict:
    """Store findings in PostgreSQL and return summary statistics."""
    
    inserted_ids = []
    for finding in findings:
        result = await conn.fetchrow(
            """
            INSERT INTO finding (
                scan_id, scanner, severity, category, title, description,
                file_path, line_start, line_end, code_snippet,
                cwe, cve, remediation, confidence, metadata
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            RETURNING id
            """,
            scan_id, finding.scanner, finding.severity, finding.category,
            finding.title, finding.description, finding.filePath,
            finding.lineStart, finding.lineEnd, finding.codeSnippet,
            finding.cwe, finding.cve, finding.remediation,
            finding.confidence, json.dumps(finding.metadata)
        )
        inserted_ids.append(result['id'])
    
    # Calculate summary statistics
    stats = await conn.fetchrow(
        """
        SELECT 
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE severity = 'critical') as critical,
            COUNT(*) FILTER (WHERE severity = 'high') as high,
            COUNT(*) FILTER (WHERE severity = 'medium') as medium,
            COUNT(*) FILTER (WHERE severity = 'low') as low,
            COUNT(*) FILTER (WHERE severity = 'info') as info
        FROM finding
        WHERE scan_id = $1
        """,
        scan_id
    )
    
    # Update scan record
    await conn.execute(
        """
        UPDATE scan
        SET findings_count = $1,
            critical_count = $2,
            high_count = $3,
            medium_count = $4,
            low_count = $5,
            info_count = $6
        WHERE scan_id = $7
        """,
        stats['total'], stats['critical'], stats['high'],
        stats['medium'], stats['low'], stats['info'], scan_id
    )
    
    return {
        'findings_count': stats['total'],
        'by_severity': {
            'critical': stats['critical'],
            'high': stats['high'],
            'medium': stats['medium'],
            'low': stats['low'],
            'info': stats['info']
        }
    }
```

### Step 3: AI Summary Generation

```python
# sec_audit/ai/summarizer.py

from anthropic import Anthropic
from typing import List
from .models import Finding

class AISummarizer:
    def __init__(self, api_key: str):
        self.client = Anthropic(api_key=api_key)
        self.model = "claude-3-opus-20240229"
    
    async def generate_summary(
        self,
        scan_id: str,
        findings: List[Finding],
        repo_url: str,
        languages: dict
    ) -> dict:
        """Generate AI summary and recommendations."""
        
        # Prepare findings summary for LLM
        findings_text = self._format_findings_for_llm(findings)
        
        prompt = f"""You are a security expert analyzing a security audit report.

Repository: {repo_url}
Languages: {', '.join(languages.keys())}

Findings Summary:
{findings_text}

Please provide:
1. An executive summary (2-3 paragraphs) of the security posture
2. Top 10 most critical findings with specific remediation steps
3. Overall risk score (0-100)
4. Prioritized recommendations grouped by:
   - Critical/High priority (immediate action)
   - Medium priority (plan for next sprint)
   - Low priority (technical debt)

Format your response as JSON:
{{
  "summary": "Executive summary text...",
  "riskScore": 75,
  "topFindings": [1, 2, 3, ...], // Finding IDs
  "recommendations": [
    {{
      "priority": "critical",
      "action": "Fix SQL injection in user authentication",
      "findingIds": [1, 5],
      "estimatedEffort": "medium"
    }}
  ]
}}
"""
        
        response = self.client.messages.create(
            model=self.model,
            max_tokens=4000,
            messages=[{
                "role": "user",
                "content": prompt
            }]
        )
        
        # Parse JSON response
        import json
        result = json.loads(response.content[0].text)
        
        return {
            'summary': result['summary'],
            'riskScore': result['riskScore'],
            'topFindings': result['topFindings'],
            'recommendations': result['recommendations'],
            'tokensUsed': response.usage.input_tokens + response.usage.output_tokens
        }
    
    def _format_findings_for_llm(self, findings: List[Finding]) -> str:
        """Format findings for LLM consumption."""
        lines = []
        for i, finding in enumerate(findings, 1):
            lines.append(f"""
Finding #{i}:
- Severity: {finding.severity}
- Category: {finding.category}
- Title: {finding.title}
- File: {finding.filePath or 'N/A'} (lines {finding.lineStart}-{finding.lineEnd})
- Description: {finding.description}
- CWE: {finding.cwe or 'N/A'}
- CVE: {finding.cve or 'N/A'}
""")
        return "\n".join(lines)
```

### Step 4: Deep Code Analysis (Cursor-Style)

For critical findings, perform deep code analysis:

```python
# sec_audit/ai/code_analyzer.py

from pathlib import Path
from anthropic import Anthropic
from typing import Optional

class CodeAnalyzer:
    def __init__(self, api_key: str):
        self.client = Anthropic(api_key=api_key)
        self.model = "claude-3-opus-20240229"
    
    async def analyze_finding(
        self,
        finding: Finding,
        repo_path: Path
    ) -> dict:
        """Analyze source code context for a finding."""
        
        if not finding.filePath:
            return {'error': 'No file path for finding'}
        
        file_path = repo_path / finding.filePath
        
        if not file_path.exists():
            return {'error': 'File not found'}
        
        # Read file with context (surrounding lines)
        code_context = self._read_file_with_context(
            file_path,
            finding.lineStart,
            finding.lineEnd,
            context_lines=20
        )
        
        prompt = f"""You are analyzing a security vulnerability in source code.

Finding:
- Severity: {finding.severity}
- Category: {finding.category}
- Title: {finding.title}
- Description: {finding.description}
- CWE: {finding.cwe or 'N/A'}

Code Context:
```{file_path.suffix}
{code_context}
```

Please provide:
1. Detailed analysis of the vulnerability
2. How it could be exploited
3. Specific remediation code (show before/after)
4. Additional security considerations

Format as JSON with fields: analysis, exploit_scenario, remediation_code, additional_notes
"""
        
        response = self.client.messages.create(
            model=self.model,
            max_tokens=2000,
            messages=[{
                "role": "user",
                "content": prompt
            }]
        )
        
        import json
        return json.loads(response.content[0].text)
    
    def _read_file_with_context(
        self,
        file_path: Path,
        line_start: int,
        line_end: int,
        context_lines: int = 20
    ) -> str:
        """Read file with surrounding context lines."""
        with file_path.open('r', encoding='utf-8', errors='ignore') as f:
            lines = f.readlines()
        
        # Calculate context range
        start = max(0, line_start - context_lines - 1)
        end = min(len(lines), line_end + context_lines)
        
        context = lines[start:end]
        
        # Add line numbers
        numbered = []
        for i, line in enumerate(context, start=start + 1):
            marker = ">>> " if start + len(numbered) + 1 >= line_start and start + len(numbered) + 1 <= line_end else "    "
            numbered.append(f"{marker}{i:4d} | {line}")
        
        return "".join(numbered)
```

## Integration with Scan Worker

### Updated Scan Worker Pipeline

```python
# tasks/scan_worker.py (additions)

from sec_audit.ai.normalizer import normalize_findings
from sec_audit.ai.storage import store_findings
from sec_audit.ai.summarizer import AISummarizer
from sec_audit.ai.code_analyzer import CodeAnalyzer
import asyncpg
import os

@celery_app.task(bind=True, name='tasks.scan_worker.run_scan', max_retries=3)
def run_scan(self, scan_id: str, request_data: Dict[str, Any]) -> Dict[str, Any]:
    # ... existing scan logic ...
    
    # After all scans complete (Step 5):
    
    # Step 6: Normalize findings
    self.update_state(
        state='PROGRESS',
        meta={'progress': 96, 'current_step': 'Normalizing findings'}
    )
    
    findings = normalize_findings(results_dir)
    logger.info(f"Normalized {len(findings)} findings")
    
    # Step 7: Store findings in PostgreSQL
    self.update_state(
        state='PROGRESS',
        meta={'progress': 97, 'current_step': 'Storing findings in database'}
    )
    
    db_url = os.getenv("DATABASE_URL")
    async with asyncpg.create_pool(db_url) as pool:
        async with pool.acquire() as conn:
            stats = await store_findings(conn, scan_id, findings)
    
    # Step 8: Upload raw outputs to S3 (if configured)
    s3_enabled = os.getenv("S3_ENABLED", "false").lower() == "true"
    if s3_enabled:
        self.update_state(
            state='PROGRESS',
            meta={'progress': 98, 'current_step': 'Uploading to S3'}
        )
        s3_path = upload_to_s3(results_dir, scan_id)
        results['s3_results_path'] = s3_path
    
    # Step 9: AI Analysis (optional, can be async)
    ai_enabled = os.getenv("AI_ANALYSIS_ENABLED", "false").lower() == "true"
    if ai_enabled and findings:
        self.update_state(
            state='PROGRESS',
            meta={'progress': 99, 'current_step': 'Generating AI analysis'}
        )
        
        try:
            ai_api_key = os.getenv("ANTHROPIC_API_KEY")
            if not ai_api_key:
                logger.warning("AI analysis enabled but no API key found")
            else:
                summarizer = AISummarizer(ai_api_key)
                ai_summary = await summarizer.generate_summary(
                    scan_id, findings, repo_url, language_counts
                )
                
                # Store AI summary in database
                async with pool.acquire() as conn:
                    ai_analysis_id = await conn.fetchval(
                        """
                        INSERT INTO ai_analysis (
                            scan_id, summary, recommendations,
                            risk_score, top_findings, model, tokens_used
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                        RETURNING id
                        """,
                        scan_id, ai_summary['summary'],
                        json.dumps(ai_summary['recommendations']),
                        ai_summary['riskScore'],
                        json.dumps(ai_summary['topFindings']),
                        summarizer.model, ai_summary['tokensUsed']
                    )
                    
                    # Link to scan
                    await conn.execute(
                        "UPDATE scan SET ai_analysis_id = $1 WHERE scan_id = $2",
                        ai_analysis_id, scan_id
                    )
                
                results['ai_analysis'] = ai_summary
                logger.info("AI analysis completed")
        except Exception as e:
            logger.error(f"AI analysis failed: {e}", exc_info=True)
            # Don't fail the scan if AI analysis fails
    
    # ... rest of existing logic ...
```

## LLM Provider Options

### Option 1: Anthropic Claude (Recommended for Code Analysis)

**Pros:**
- Excellent code understanding
- Large context window (200K tokens)
- Structured output with JSON mode
- Best for deep code analysis

**Cons:**
- Higher cost per token
- Slower response times

**Configuration:**
```bash
ANTHROPIC_API_KEY=sk-ant-...
AI_MODEL=claude-3-opus-20240229  # or claude-3-sonnet-20240229
```

### Option 2: OpenAI GPT-4

**Pros:**
- Good for summarization
- Function calling for structured output
- Faster than Claude Opus
- Cost-effective for bulk processing

**Cons:**
- Smaller context window (128K tokens)
- Less specialized for code analysis

**Configuration:**
```bash
OPENAI_API_KEY=sk-...
AI_MODEL=gpt-4-turbo-preview
```

### Option 3: Local LLM (Ollama/Llama)

**Pros:**
- No API costs
- Privacy for sensitive code
- Full control

**Cons:**
- Requires GPU resources
- Lower quality than cloud models
- Slower processing

**Configuration:**
```bash
LOCAL_LLM_ENABLED=true
LOCAL_LLM_URL=http://localhost:11434
LOCAL_LLM_MODEL=llama2:13b
```

## Cost Considerations

### Token Usage Estimates

- **Findings Summary**: ~500-2000 tokens per scan
- **Code Analysis**: ~1000-5000 tokens per critical finding
- **Full Scan Analysis**: ~2000-10000 tokens total

### Cost Optimization Strategies

1. **Cache AI Results**: Don't re-analyze identical findings
2. **Batch Processing**: Process multiple findings in one request
3. **Selective Analysis**: Only analyze critical/high severity findings
4. **Model Selection**: Use cheaper models (Sonnet vs Opus) for summaries
5. **Async Processing**: Run AI analysis as separate task (don't block scan completion)

## API Endpoints

### New Endpoints for AI Analysis

```typescript
// Next.js API Routes

// Get findings for a scan
GET /api/scans/{scanId}/findings
Response: {
  findings: Finding[],
  summary: {
    total: number,
    by_severity: {...},
    by_category: {...}
  }
}

// Get AI analysis
GET /api/scans/{scanId}/ai-analysis
Response: {
  summary: string,
  riskScore: number,
  recommendations: Recommendation[],
  topFindings: Finding[]
}

// Get detailed code analysis for a finding
GET /api/scans/{scanId}/findings/{findingId}/analysis
Response: {
  analysis: string,
  exploitScenario: string,
  remediationCode: string,
  additionalNotes: string
}
```

## Implementation Phases

### Phase 1: Findings Normalization (Week 1)
- [ ] Create findings normalizer module
- [ ] Implement parsers for each scanner
- [ ] Create database schema and migration
- [ ] Update scan worker to normalize findings
- [ ] Store findings in PostgreSQL

### Phase 2: AI Summary Generation (Week 2)
- [ ] Integrate LLM provider (Anthropic/OpenAI)
- [ ] Create AI summarizer service
- [ ] Generate executive summaries
- [ ] Store AI analysis in database
- [ ] Add API endpoints for AI summaries

### Phase 3: Deep Code Analysis (Week 3)
- [ ] Implement code analyzer
- [ ] Add file reading with context
- [ ] Generate remediation code
- [ ] Store detailed analysis
- [ ] Add API endpoints for code analysis

### Phase 4: S3 Integration (Week 4)
- [ ] Set up S3 client
- [ ] Upload raw scanner outputs
- [ ] Upload large analysis files
- [ ] Generate pre-signed URLs
- [ ] Add cleanup policies

### Phase 5: Frontend Integration (Week 5)
- [ ] Display findings in UI
- [ ] Show AI summaries
- [ ] Display code analysis
- [ ] Add filtering and search
- [ ] Create dashboards

## Security Considerations

1. **API Key Management**: Store LLM API keys in environment variables, never in code
2. **Code Privacy**: For sensitive repos, consider local LLM or on-premise deployment
3. **Rate Limiting**: Implement rate limits for AI analysis to control costs
4. **Input Sanitization**: Sanitize code snippets before sending to LLM
5. **Output Validation**: Validate LLM JSON responses before storing

## Monitoring and Observability

1. **Token Usage Tracking**: Log tokens used per scan for cost monitoring
2. **AI Analysis Latency**: Track time spent in AI analysis
3. **Error Rates**: Monitor AI analysis failures
4. **Cost Alerts**: Set up alerts for high token usage

---

**Document Version:** 1.0  
**Last Updated:** 2025-01-25  
**Author:** Architecture Team  
**Related Documents:** DESIGN_v0.md (Base Architecture)
