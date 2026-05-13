# MostlyLearn — WhatsApp-Native Tutoring Ops OS

Solo founder (BHMS doctor) connecting UK/US Indian-origin students with verified IIT/NIT/doctor tutors from India. Zero mark-up model. GBP 12/class. Teacher gets GBP 8.

## Status
- Design doc: `.opencode/plans/mostlylearn-design.md`
- Plan: `.opencode/plans/mostlylearn-tracka-plan.md`
- Reviews: Eng + CEO CLEARED. Outside voice fixes accepted.

## Tech Stack (Track A)
- **Runtime:** Cloudflare Workers (single script, route-based handlers)
- **Data:** Google Sheets (Phase 1) → D1/Turso (Track B)
- **Payments:** Stripe (primary) + Wise (secondary)
- **Scheduling:** Calendly
- **Messaging:** WhatsApp Business Cloud API
- **Deploy:** `cd workers && bun run deploy`

## Structure
```
mostlylearn/
  workers/           Cloudflare Workers codebase
    src/index.ts     Main worker with all route handlers
    wrangler.toml    Cloudflare config
  docs/
    SOP.md           Operations manual
  CLAUDE.md          AI routing rules
```

## Routes
| Route | Method | Purpose |
|-------|--------|---------|
| /api/health | GET | Health check |
| /api/whatsapp | POST | WhatsApp webhook handler |
| /api/stripe | POST | Stripe webhook with event ID dedup |
| /api/calendly | POST | Calendly booking confirmation |
| /api/admin | GET | Admin dashboard proxy |
| /api/referral | POST | Referral code validation |
| /api/logs | GET | Recent webhook activity log |

## Key Decisions
- Single Workers script (not multi-service)
- Sheets as database (migrate at 30 classes/week)
- Manual teacher-student matching
- Manual test scripts in SOP
- Stripe event ID dedup in KV
- Write queue for Sheets race conditions
- Test mode flag for staging
- GBP 8/class fixed teacher payout

## Referrals
- Codes: ML-{phone_last4} / ML-T{teacher_id}
- Student referrer → 1 free class after referee's first paid class
- Teacher referrer → INR 500 one-time bonus
- Self-referral blocked. Uncapped.
