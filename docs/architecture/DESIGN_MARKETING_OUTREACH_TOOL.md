# Marketing Outreach Tool - Design Document

## Overview

A powerful marketing tool for admins to promote the SecurityKit service by leveraging existing scan results. This tool enables admins to:

1. **Create shareable scan reports** (summary or full) from completed scans
2. **Open GitHub issues** on scanned repositories to notify maintainers about security findings
3. **Bulk operations** for efficient outreach campaigns
4. **Track outreach effectiveness** through click analytics

## Goals

- Drive organic growth through security-conscious repository maintainers
- Provide value upfront (free security insights) to potential customers
- Create viral loops via shareable scan reports
- Establish SecurityKit as an authority in open-source security

---

## User Flow

### 1. Admin Accesses Marketing Tool

```
Admin Dashboard → Marketing Outreach (new tab)
```

### 2. Scan Selection

Admin is presented with a filtered list of **completed scans** that are:
- From public GitHub repositories
- Have at least one finding (critical/high/medium recommended)
- Not previously used for outreach (optional filter)
- Sorted by finding severity or repo popularity

### 3. Outreach Actions

For each selected scan, admin can:

#### Option A: Create Share Link
- Choose **Summary** (finding counts, risk score) or **Full Report** (all details)
- Set expiration (7/30/90 days or never)
- Get shareable URL: `https://securitykit.dev/share/{token}`

#### Option B: Open GitHub Issue
- Preview auto-generated issue content
- Customize title and body
- One-click open in new tab with pre-filled GitHub issue form

#### Option C: Both
- Create share link + include it in GitHub issue body

---

## UI Design

### Marketing Outreach Page

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Marketing Outreach Tool                                        [Help] [?]  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  📊 Outreach Stats          │  🎯 Quick Actions                      │  │
│  │  ───────────────────────────────────────────────────────────────────  │  │
│  │  Links Created: 128         │  [Create Bulk Shares]                  │  │
│  │  Issues Opened: 45          │  [Open GitHub Issues]                  │  │
│  │  Click-through: 32%         │  [View Analytics]                      │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  🔍 Filters                                                           │  │
│  │  [Search repos...] [Status: Completed ▼] [Has Findings: Yes ▼]        │  │
│  │  [Min Severity: High ▼] [Repository: Public ▼] [Not Contacted ✓]      │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  Selected: 3 scans    [Create Shares] [Open GitHub Issues]            │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  □  facebook/react                                                   │    │
│  │      ├─ 12 findings (2 Critical, 5 High)                            │    │
│  │      ├─ Branch: main @ a1b2c3d                                      │    │
│  │      ├─ Scanned: 2 hours ago                                        │    │
│  │      └─ Actions: [Share] [GitHub Issue] [Both]                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  □  kubernetes/kubernetes                                            │    │
│  │      ├─ 8 findings (1 Critical, 3 High)                             │    │
│  │      ├─ Branch: master @ e5f6g7h                                    │    │
│  │      ├─ Scanned: 5 hours ago                                        │    │
│  │      └─ Actions: [Share ✓] [GitHub Issue] [Both]                    │    │
│  │         └─ Share link created: /share/abc123 (32 clicks)            │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  □  vercel/next.js                                                   │    │
│  │      ├─ 5 findings (2 High, 3 Medium)                               │    │
│  │      ├─ Branch: canary @ i9j0k1l                                    │    │
│  │      ├─ Scanned: 1 day ago                                          │    │
│  │      └─ Actions: [Share] [GitHub Issue ✓] [Both]                    │    │
│  │         └─ Issue opened: #12345                                     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Create Share Dialog

```
┌─────────────────────────────────────────────────────────┐
│  Create Share Link                             [X]      │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Repository: facebook/react                             │
│  Findings: 12 (2 Critical, 5 High, 3 Medium, 2 Low)    │
│                                                         │
│  Share Type:                                            │
│  ○ Summary Only (finding counts, risk score)           │
│  ● Full Report (all findings with details)             │
│                                                         │
│  Expiration:                                            │
│  [Never ▼]                                              │
│                                                         │
│  Marketing Options:                                     │
│  [✓] Include CTA to try SecurityKit                     │
│  [✓] Track clicks for analytics                        │
│                                                         │
│  Preview:                                               │
│  ┌─────────────────────────────────────────────────┐   │
│  │  🔒 Security Scan Report for facebook/react      │   │
│  │                                                  │   │
│  │  Risk Score: 72/100 (High)                       │   │
│  │  Findings: 12 vulnerabilities found              │   │
│  │                                                  │   │
│  │  [View Full Report]  [Scan Your Own Repo]        │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│              [Cancel]  [Create Share Link]              │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### GitHub Issue Preview Dialog

```
┌─────────────────────────────────────────────────────────┐
│  Open GitHub Issue                             [X]      │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Repository: facebook/react                             │
│  Target: https://github.com/facebook/react/issues/new   │
│                                                         │
│  Issue Title:                                           │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Security scan findings (main · a1b2c3d)         │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  Issue Body:                                            │
│  ┌─────────────────────────────────────────────────┐   │
│  │ ## 🔒 Security Scan Report                       │   │
│  │                                                  │   │
│  │ A security scan of this repository identified   │   │
│  │ **12 potential vulnerabilities**:               │   │
│  │                                                  │   │
│  │ - 🔴 Critical: 2                                │   │
│  │ - 🟠 High: 5                                    │   │
│  │ - 🟡 Medium: 3                                  │   │
│  │ - 🔵 Low: 2                                     │   │
│  │                                                  │   │
│  │ 📊 **View detailed report:**                    │   │
│  │ https://securitykit.dev/share/xyz789            │   │
│  │                                                  │   │
│  │ ---                                              │   │
│  │ *Generated by [SecurityKit](https://securitykit..│   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  Options:                                               │
│  [✓] Include share link in issue                        │
│  [✓] Add "good first issue" label suggestion           │
│                                                         │
│         [Cancel]  [Open GitHub Issue →]                 │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## API Design

### New Endpoints

#### 1. List Scans for Outreach
```
GET /api/admin/marketing/scans
```

Query Parameters:
- `status` - Filter by scan status (default: "completed")
- `hasFindings` - boolean (default: true)
- `minSeverity` - "critical" | "high" | "medium" | "low"
- `onlyPublic` - boolean (default: true)
- `notContacted` - boolean (filter out previously contacted repos)
- `search` - string (repo name/URL search)
- `limit` - number (default: 50)
- `offset` - number

Response:
```json
{
  "scans": [
    {
      "scanId": "uuid",
      "repoUrl": "https://github.com/facebook/react",
      "repoName": "facebook/react",
      "branch": "main",
      "commitHash": "a1b2c3d...",
      "findingsCount": 12,
      "criticalCount": 2,
      "highCount": 5,
      "mediumCount": 3,
      "lowCount": 2,
      "createdAt": "2026-02-04T10:00:00Z",
      "outreachStatus": {
        "shareCreated": true,
        "shareToken": "abc123",
        "shareClicks": 32,
        "issueOpened": false
      }
    }
  ],
  "total": 128
}
```

#### 2. Bulk Create Share Links
```
POST /api/admin/marketing/shares
```

Body:
```json
{
  "scanIds": ["uuid1", "uuid2"],
  "shareType": "summary" | "full",
  "expiresInDays": 30 | null,
  "includeBranding": true
}
```

Response:
```json
{
  "shares": [
    {
      "scanId": "uuid1",
      "token": "abc123",
      "url": "https://securitykit.dev/share/abc123",
      "created": true
    }
  ],
  "errors": []
}
```

#### 3. Record Outreach Activity
```
POST /api/admin/marketing/outreach
```

Body:
```json
{
  "scanId": "uuid",
  "type": "github_issue",
  "metadata": {
    "issueUrl": "https://github.com/facebook/react/issues/12345",
    "shareToken": "abc123"  // optional, if included in issue
  }
}
```

#### 4. Get Outreach Analytics
```
GET /api/admin/marketing/analytics
```

Query Parameters:
- `period` - "7d" | "30d" | "90d" | "all"

Response:
```json
{
  "summary": {
    "sharesCreated": 128,
    "issuesOpened": 45,
    "totalClicks": 412,
    "uniqueVisitors": 298,
    "ctr": 0.32
  },
  "topPerforming": [
    {
      "repo": "facebook/react",
      "clicks": 45,
      "shareUrl": "https://securitykit.dev/share/abc123"
    }
  ],
  "timeline": [
    {
      "date": "2026-02-01",
      "sharesCreated": 5,
      "clicks": 12
    }
  ]
}
```

---

## Database Schema

### New Table: `outreach_activity`

```sql
CREATE TABLE outreach_activity (
    id SERIAL PRIMARY KEY,
    scan_id UUID NOT NULL REFERENCES scans(scan_id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL, -- 'share_created', 'github_issue_opened'
    share_token VARCHAR(255),  -- reference to scan_shares.token
    metadata JSONB,            -- issue URL, additional context
    created_by VARCHAR(255),   -- admin email
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_outreach_activity_scan_id ON outreach_activity(scan_id);
CREATE INDEX idx_outreach_activity_type ON outreach_activity(type);
CREATE INDEX idx_outreach_activity_created_at ON outreach_activity(created_at);
```

### Modified Table: `scan_shares`

Add tracking columns:
```sql
ALTER TABLE scan_shares ADD COLUMN click_count INTEGER DEFAULT 0;
ALTER TABLE scan_shares ADD COLUMN unique_visitors INTEGER DEFAULT 0;
ALTER TABLE scan_shares ADD COLUMN last_clicked_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE scan_shares ADD COLUMN is_marketing_share BOOLEAN DEFAULT FALSE;
```

---

## Click Tracking Implementation

### Server-side
Update click counts when share page is accessed:

```typescript
// In /share/[token]/page.tsx or middleware
async function trackShareView(token: string, req: Request) {
  const ip = req.headers.get('x-forwarded-for') || 'unknown';
  const userAgent = req.headers.get('user-agent') || '';
  
  // Update click count
  await db.update(scanShares)
    .set({ 
      clickCount: sql`${scanShares.clickCount} + 1`,
      lastClickedAt: new Date()
    })
    .where(eq(scanShares.token, token));
    
  // Log for unique visitor calculation (can use Redis for dedup)
  await logShareView(token, ip, userAgent);
}
```

### Analytics Aggregation
Daily job to calculate unique visitors from logs.

---

## GitHub Issue Templates

### Template Variables

| Variable | Description |
|----------|-------------|
| `{{repoName}}` | Repository name (e.g., "facebook/react") |
| `{{branch}}` | Scanned branch |
| `{{commitHash}}` | Short commit hash |
| `{{findingsCount}}` | Total findings |
| `{{criticalCount}}` | Critical findings |
| `{{highCount}}` | High findings |
| `{{mediumCount}}` | Medium findings |
| `{{lowCount}}` | Low findings |
| `{{shareUrl}}` | Share link URL |
| `{{scanDate}}` | Scan date |

### Default Template

```markdown
## 🔒 Security Scan Report

A security scan of **{{repoName}}** identified **{{findingsCount}} potential security vulnerabilities**:

{{#if criticalCount}}- 🔴 Critical: {{criticalCount}}{{/if}}
{{#if highCount}}- 🟠 High: {{highCount}}{{/if}}
{{#if mediumCount}}- 🟡 Medium: {{mediumCount}}{{/if}}
{{#if lowCount}}- 🔵 Low: {{lowCount}}{{/if}}

### Scan Details
- **Branch:** {{branch}}
- **Commit:** {{commitHash}}
- **Date:** {{scanDate}}

{{#if shareUrl}}
### 📊 Detailed Report
View the complete security analysis with remediation guidance:
**{{shareUrl}}**
{{/if}}

---

This scan was performed using [SecurityKit](https://securitykit.dev), 
a free security scanning service for open-source projects.

*This issue was created to help improve the security posture of the project. 
Feedback is welcome!*
```

---

## Security & Ethical Considerations

### Rate Limiting
- Max 10 GitHub issues per hour per admin
- Bulk operations limited to 50 scans at once
- Cooldown period between outreach to same repository (7 days)

### Privacy
- Only public repositories are eligible
- No PII in share links or issue bodies
- Scans of private repos are excluded from marketing tool

### Anti-Spam
- Require admin approval before bulk operations
- Template customization must be reviewed
- Option for repositories to opt-out via `.securitykit-ignore` file

### GitHub Terms Compliance
- Issues created manually (opens browser, not API)
- Clear indication that issue is from automated scan
- Easy opt-out mechanism
- No persistent bot accounts

---

## Implementation Phases

### Phase 1: Basic Share Creation (MVP)
- [ ] Marketing Outreach page UI
- [ ] List scans with filters
- [ ] Individual share creation
- [ ] Basic analytics (share count)

### Phase 2: GitHub Integration
- [ ] GitHub issue preview dialog
- [ ] Template system
- [ ] One-click issue creation
- [ ] Outreach activity tracking

### Phase 3: Bulk Operations & Analytics
- [ ] Multi-select scans
- [ ] Bulk share creation
- [ ] Bulk GitHub issue prep
- [ ] Click tracking
- [ ] Analytics dashboard

### Phase 4: Advanced Features
- [ ] A/B testing for templates
- [ ] Scheduled outreach campaigns
- [ ] Repository popularity scoring
- [ ] Auto-follow-up reminders

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Share click-through rate | > 25% |
| GitHub issue response rate | > 10% |
| New signups from shares | > 5% of clicks |
| Repository maintainer engagement | > 15% positive reactions |

---

## Future Enhancements

1. **Email Outreach** - Contact maintainers via email when available
2. **Twitter/X Integration** - Auto-tweet about high-profile security findings
3. **Badge Program** - "Scanned by SecurityKit" badges for repos
4. **Bounty Program** - Reward admins for successful conversions
5. **ML-Powered Targeting** - Identify most likely-to-convert repositories
