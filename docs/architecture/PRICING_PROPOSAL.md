# SecurityKit Pricing Implementation Proposal

**Date:** January 2026
**Status:** Draft
**Author:** Claude Code

---

## Executive Summary

This proposal outlines the implementation of a monetization system for SecurityKit, transforming it from an open platform into a sustainable SaaS business with three pricing tiers: Free, Pro, and Custom.

The implementation leverages proven patterns from the existing indie-kit billing infrastructure, reducing development risk and accelerating time-to-market.

---

## Business Model

### Pricing Tiers

| Tier | Monthly | Yearly | Target Customer |
|------|---------|--------|-----------------|
| **Free** | €0 | - | Open source developers, evaluation |
| **Pro** | €29 | €290 (save €58) | Individual developers, freelancers |
| **Custom** | From €500 | Custom | Enterprise, agencies |

### Revenue Projections (Conservative)

| Metric | Month 3 | Month 6 | Month 12 |
|--------|---------|---------|----------|
| Free users | 500 | 1,500 | 5,000 |
| Pro subscribers | 20 | 80 | 300 |
| **MRR** | €580 | €2,320 | €8,700 |
| **ARR** | €6,960 | €27,840 | €104,400 |

---

## Feature Matrix

| Feature | Free | Pro | Custom |
|---------|------|-----|--------|
| Scans per month | 5 | 50 | Unlimited |
| Public repositories | Yes | Yes | Yes |
| Private repositories | - | Yes | Yes |
| Export reports (PDF/JSON) | - | Yes | Yes |
| Email notifications | - | Yes | Yes |
| Scheduled scans | - | Yes | Yes |
| Team collaboration | - | - | Yes |
| API & CI/CD access | - | - | Yes |
| Custom policies | - | - | Yes |
| Support | Community | Priority | Dedicated |

---

## Technical Architecture

### Current State

```
┌─────────────────────────────────────────────────────────┐
│                    SecurityKit Webapp                    │
├─────────────────────────────────────────────────────────┤
│  Next.js 16 + React 19                                  │
│  NextAuth v5 (GitHub OAuth)                             │
│  Drizzle ORM + PostgreSQL                               │
│  No billing infrastructure                              │
└─────────────────────────────────────────────────────────┘
```

### Proposed State

```
┌─────────────────────────────────────────────────────────┐
│                    SecurityKit Webapp                    │
├─────────────────────────────────────────────────────────┤
│  Next.js 16 + React 19                                  │
│  NextAuth v5 (GitHub OAuth)                             │
│  Drizzle ORM + PostgreSQL                               │
├─────────────────────────────────────────────────────────┤
│  NEW: Subscription Management                           │
│  ├── Plans & quotas (database)                          │
│  ├── Usage tracking (scans per period)                  │
│  ├── Feature gating (private repos, exports)            │
│  └── Trial management (14-day, no CC required)          │
├─────────────────────────────────────────────────────────┤
│  NEW: Stripe Integration                                │
│  ├── Checkout (subscription + trial)                    │
│  ├── Customer Portal (manage billing)                   │
│  ├── Webhooks (subscription lifecycle)                  │
│  └── Invoicing (automated)                              │
├─────────────────────────────────────────────────────────┤
│  NEW: Email Notifications (Resend)                      │
│  ├── Trial started/ending/ended                         │
│  ├── Scan limit warnings                                │
│  └── Payment success/failure                            │
└─────────────────────────────────────────────────────────┘
```

### Database Schema Additions

```
┌──────────────────┐    ┌──────────────────┐
│      plans       │    │  subscriptions   │
├──────────────────┤    ├──────────────────┤
│ id (PK)          │◄───│ plan_id (FK)     │
│ name             │    │ user_id (FK)     │
│ monthly_price    │    │ status           │
│ yearly_price     │    │ billing_cycle    │
│ quotas (JSONB)   │    │ stripe_*         │
│ trial_days       │    │ trial_ends_at    │
│ stripe_price_*   │    │ current_period_* │
└──────────────────┘    └──────────────────┘
                              │
                              ▼
                        ┌──────────────────┐
                        │  usage_records   │
                        ├──────────────────┤
                        │ user_id (FK)     │
                        │ period_start/end │
                        │ scans_used       │
                        │ scans_limit      │
                        └──────────────────┘
```

---

## Code Reuse from indie-kit

Code available in: /Users/andreclaro/Code/00.Personal/indie-kit

The implementation leverages battle-tested patterns from the indie-kit billing system:

### Direct Adaptations

| indie-kit Source | SecurityKit Target | Adaptation |
|------------------|-------------------|------------|
| `src/db/schema/plans.ts` | `frontend/src/db/schema.ts` | Simplify for single provider (Stripe) |
| `src/db/schema/credits.ts` | `frontend/src/db/schema.ts` | Rename to usage_records for scans |
| `src/lib/stripe/index.ts` | `frontend/src/lib/stripe/index.ts` | Direct copy |
| `src/lib/stripe/StripeWebhookHandler.ts` | `frontend/src/lib/stripe/webhook-handler.ts` | Remove credit purchase logic |
| `src/lib/credits/recalculate.ts` | `frontend/src/lib/usage.ts` | Adapt for scan counting |
| `src/app/super-admin/plans/` | `frontend/src/app/app/admin/plans/` | Simplify admin UI |

### Key Patterns to Follow

1. **Webhook Handler Class Pattern**
   - Clean separation of event handling logic
   - Idempotency via event ID tracking
   - Comprehensive error handling

2. **Quota/Credits Management**
   - JSONB field for flexible quotas
   - Transaction ledger for usage tracking
   - Period-based reset logic

3. **Checkout Flow**
   - Metadata propagation through Stripe
   - Trial period configuration
   - Success/cancel URL handling

---

## Implementation Phases

### Phase 1: MVP (Week 1-2)
- Database schema and migration
- Subscription service library
- Free tier enforcement (5 scans/month)
- Pricing page (display only)

**Deliverables:**
- Users are limited to 5 scans/month
- Pricing page shows all tiers
- Foundation ready for Stripe

### Phase 2: Monetization (Week 3-4)
- Stripe integration
- Checkout flow
- Webhook handlers
- Customer portal

**Deliverables:**
- Users can subscribe to Pro
- Automatic plan upgrades
- Billing portal access

### Phase 3: Trial & Conversion (Week 5-6)
- 14-day trial system
- Upgrade modals (feature gates)
- Email notifications
- Billing dashboard

**Deliverables:**
- No-CC trial for Pro
- Upgrade prompts on limit hit
- Email lifecycle (trial ending, etc.)

---

## User Experience

### Free Tier User Journey

```
Sign up → 5 free scans → Hit limit → "Upgrade for more scans" modal
                                    ↓
                              View pricing → Start 14-day trial (no CC)
                                    ↓
                              Full Pro features for 14 days
                                    ↓
                              Trial ending email (day 12)
                                    ↓
                              Add payment OR downgrade to Free
```

### Upgrade Modal Design

**Positive framing ("upgrade to get X" not "you can't do X"):**

> **Need more scans?**
> You've used all 5 scans this month. Upgrade to Pro for 50 scans/month.
> [View Plans] [Maybe Later]

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Stripe integration complexity | Reuse proven indie-kit webhook handler |
| Webhook failures | Idempotency via stripe_event_id, retry logic |
| Trial abuse | GitHub OAuth ensures unique identity |
| Payment failures | Graceful degradation to Free tier |
| Feature creep | Strict phase boundaries |

---

## Success Metrics

### Launch Criteria (Phase 2 Complete)
- [ ] Users can upgrade to Pro
- [ ] Stripe webhooks processing correctly
- [ ] Subscription status accurate in database
- [ ] Customer portal accessible

### 30-Day Post-Launch
- Free → Trial conversion rate > 10%
- Trial → Paid conversion rate > 20%
- Churn rate < 5%
- Support tickets < 10/week

---

## Dependenciesf

### External Services
- **Stripe** - Payment processing
- **Resend** - Transactional email (optional: Postmark, SES)

### Environment Variables
```
# Stripe
STRIPE_SECRET_KEY=sk_...
STRIPE_PUBLISHABLE_KEY=pk_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Email
RESEND_API_KEY=re_...
```

---

## Estimated Effort

| Phase | Effort | Dependencies |
|-------|--------|--------------|
| Phase 1: MVP | 1-2 weeks | None |
| Phase 2: Stripe | 1-2 weeks | Stripe account, products |
| Phase 3: Polish | 1-2 weeks | Email service (Resend) |

**Total MVP + Monetization: 4-6 weeks**

---

## Appendix: Email Templates

### Trial Started
```
Subject: Your 14-day Pro trial has started

Welcome to SecurityKit Pro!

You now have access to:
- 50 scans per month
- Private repository scanning
- PDF & JSON exports
- Scheduled scans
- Priority support

Your trial ends on [DATE]. No credit card required.

[Start your first scan →]
```

### Trial Ending (2 days before)
```
Subject: Your trial ends in 2 days

Your SecurityKit Pro trial ends on [DATE].

During your trial, you:
- Ran X scans
- Found Y vulnerabilities
- Scanned Z private repos

To keep these features, add a payment method:
[Upgrade to Pro - €29/month →]

After your trial, you'll be downgraded to Free (5 scans/month, public repos only).
```

### Scan Limit Reached
```
Subject: You've used all 5 scans this month

You've reached your monthly scan limit.

Your limit resets on [DATE], or upgrade now for more:

Pro (€29/mo): 50 scans/month + private repos

[View plans →]
```

---

## Approval

- [ ] Technical approach approved
- [ ] Pricing confirmed
- [ ] Stripe account ready
- [ ] Email service configured

---

*Document generated by Claude Code*
