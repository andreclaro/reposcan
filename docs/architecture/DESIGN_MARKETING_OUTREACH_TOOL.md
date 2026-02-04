# Marketing Outreach Tool - Design Document

## Overview

A lightweight marketing tool for admins to promote SecurityKit by leveraging existing scan results. This MVP enables admins to create shareable scan reports and open GitHub issues on scanned repositories.

## MVP Implementation Status

### ✅ Completed Features

1. **Share Scan Reports** - Create public share links from admin dashboard
   - Summary or Full Report options
   - Configurable expiration (7/30/90 days or never)
   - Existing share links reused in GitHub issues

2. **Open GitHub Issues** - One-click issue creation
   - Auto-generated issue title and body
   - Pre-filled with finding counts by severity
   - Optional share link inclusion
   - Records outreach activity for tracking

3. **Admin Integration** - Built into existing admin scans dashboard
   - Share button for completed scans
   - GitHub button for completed scans  
   - No separate page needed

### 📁 Files Added/Modified

| File | Purpose |
|------|---------|
| `frontend/src/components/admin/github-issue-dialog.tsx` | GitHub issue preview & creation |
| `frontend/src/components/ui/textarea.tsx` | UI component for issue body preview |
| `frontend/src/components/scan-share-dialog.tsx` | Modified for controlled mode |
| `frontend/src/components/admin/admin-dashboard.tsx` | Added Share/GitHub buttons |
| `frontend/src/app/api/admin/marketing/outreach/route.ts` | API to record outreach |
| `frontend/src/db/schema.ts` | Added `outreachActivity` table |
| `frontend/drizzle/0008_add_outreach_activity.sql` | Migration SQL |

---

## User Flow

```
Admin Dashboard → Scans → [Completed Scan] → [Share] or [GitHub]
```

### Creating a Share Link

1. Find a completed scan with findings
2. Click **Share** button
3. Choose **Summary** or **Full Report**
4. Set expiration
5. Copy share URL

### Opening a GitHub Issue

1. Find a completed scan (preferably with Critical/High findings)
2. Click **GitHub** button
3. Preview auto-generated issue:
   - Title: "Security scan findings (branch · commit)"
   - Body: Finding counts, scan details, optional share link
4. Click **Open GitHub Issue** → opens pre-filled GitHub form in new tab
5. Outreach activity is recorded automatically

---

## UI Screenshots

### Admin Dashboard with Marketing Buttons

```
┌─────────────────────────────────────────────────────────────┐
│  facebook/react                                              │
│  🔴 12 findings (2 Critical, 5 High, 3 Medium, 2 Low)       │
│  Branch: main @ a1b2c3d                                     │
│  Scanned: 2 hours ago                                       │
│                                                              │
│  Actions: [View] [Retry] [Rescan] [Refresh] [Share] [GitHub]│
└─────────────────────────────────────────────────────────────┘
```

### GitHub Issue Dialog

```
┌─────────────────────────────────────────────────────────┐
│  Open GitHub Issue                               [X]    │
├─────────────────────────────────────────────────────────┤
│  Repository: facebook/react                             │
│                                                         │
│  [✓] Include share link                                 │
│                                                         │
│  Issue Title:                                           │
│  Security scan findings (main · a1b2c3d)               │
│                                                         │
│  Issue Body:                              [Copy]        │
│  ┌─────────────────────────────────────────────────┐   │
│  │ ## 🔒 Security Scan Report                       │   │
│  │                                                  │   │
│  │ A security scan identified **12 vulnerabilities**:│   │
│  │                                                  │   │
│  │ - 🔴 Critical: 2                                │   │
│  │ - 🟠 High: 5                                    │   │
│  │ - 🟡 Medium: 3                                  │   │
│  │                                                  │   │
│  │ 📊 **Detailed Report:**                          │   │
│  │ https://securitykit.dev/share/abc123            │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  Findings: [2 Critical] [5 High] [3 Medium] [2 Low]     │
│                                                         │
│           [Cancel]  [Open GitHub Issue →]               │
└─────────────────────────────────────────────────────────┘
```

---

## API Endpoints

### Record Outreach Activity
```
POST /api/admin/marketing/outreach
```

Body:
```json
{
  "scanId": "uuid",
  "type": "github_issue_opened",
  "metadata": {
    "issueUrl": "https://github.com/owner/repo/issues/new?...",
    "shareToken": "abc123"
  }
}
```

### Get Outreach Activity (for a scan)
```
GET /api/admin/marketing/outreach?scanId=uuid
```

---

## Database Schema

### outreach_activity table

```sql
CREATE TABLE outreach_activity (
    id SERIAL PRIMARY KEY,
    scan_id TEXT NOT NULL REFERENCES scan(scan_id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL, -- 'github_issue_opened'
    metadata JSONB DEFAULT '{}', -- issueUrl, shareToken, etc.
    created_by TEXT NOT NULL, -- admin email
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_outreach_activity_scan_id ON outreach_activity(scan_id);
CREATE INDEX idx_outreach_activity_type ON outreach_activity(type);
CREATE INDEX idx_outreach_activity_created_at ON outreach_activity(created_at);
```

---

## Security & Ethics

### Implemented Safeguards
- **Admin-only access** - Only admins can use marketing features
- **Manual GitHub issue creation** - Opens browser, doesn't auto-submit via API
- **Clear branding** - Issues indicate they come from SecurityKit
- **Opt-out ready** - Easy for maintainers to ignore or request removal

### Rate Limiting (Future)
- Recommend max 10 GitHub issues per hour per admin
- Bulk operations limited to 50 scans

---

## Future Enhancements (Post-MVP)

### Phase 2
- [ ] Bulk operations (multi-select scans)
- [ ] Outreach analytics dashboard (click tracking, response rates)
- [ ] Template customization for GitHub issues

### Phase 3
- [ ] Auto-detect repository popularity (stars)
- [ ] Scheduled outreach campaigns
- [ ] A/B testing for issue templates

### Phase 4
- [ ] Email outreach to maintainers
- [ ] Twitter/X integration for high-profile findings
- [ ] ML-powered targeting for conversion likelihood

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Share click-through rate | > 25% |
| GitHub issue response rate | > 10% |
| New signups from shares | > 5% of clicks |

---

## Migration Instructions

To apply the database migration:

```bash
cd frontend
# Run the SQL migration
psql $DATABASE_URL < drizzle/0008_add_outreach_activity.sql

# Or use drizzle-kit if configured
npx drizzle-kit migrate
```

---

## Usage Guide for Admins

### Best Practices

1. **Target high-impact repositories**
   - Look for scans with Critical or High findings
   - Popular open-source projects get more visibility

2. **Create share link first**
   - Then include it in the GitHub issue
   - Gives maintainers detailed remediation guidance

3. **Be respectful**
   - Don't spam repositories
   - Focus on actionable security findings
   - Space out outreach to same organization

### Workflow Example

```
1. Filter scans by "completed" + "has Critical findings"
2. Select a well-known repository (e.g., facebook/react)
3. Click "Share" → Create Full Report link
4. Click "GitHub" → Include share link → Open GitHub Issue
5. In GitHub, review and submit the issue
6. Repeat for other high-value targets
```

---

*Last updated: 2026-02-04*
