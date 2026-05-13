# MostlyLearn — WhatsApp-Native Tutoring Ops OS

## Project Overview
MostlyLearn is a zero-markup tutoring platform connecting UK/US Indian-origin students with verified IIT/NIT/doctor tutors from India. Track A is a WhatsApp-native operations system built on Cloudflare Workers + Google Sheets + Stripe + Calendly. No custom frontend — WhatsApp is the UI.

## Commands
- Dev: `bun run dev` (in workers/) — starts Cloudflare Workers dev server
- Deploy: `cd workers && bun run deploy` — deploys to Cloudflare
- Test: manual test scripts in SOP (no automated test framework yet)

## Architecture
- Single Cloudflare Workers script with route-based handlers
- Routes: /api/whatsapp, /api/stripe, /api/calendly, /api/admin, /api/referral, /api/logs
- Data: Google Sheets (Phase 1), migrate to D1/Turso when Track B starts at 30 classes/week
- Payments: Stripe (primary, UK/US card) + Wise (secondary, existing students)
- Matching: Manual via Sheet (founder assigns teachers)
- Pricing: GBP 12/class flat. Teacher gets GBP 8 fixed. Platform keeps GBP 4.

## Key Decisions
- Single Worker (not multi-service)
- Sheets first, DB later
- Manual matching
- Manual test scripts in SOP
- Stripe webhook event ID dedup as mandatory guard clause
- Write queue in Workers for Sheet write race conditions
- Test mode flag for Stripe webhook staging

## Referral System
- Codes: ML-{phone_last4} for students, ML-T{teacher_id} for teachers
- Student referrer: 1 free class after referee's first paid class
- Teacher referrer: INR 500 one-time bonus
- Self-referral blocked. First code wins. Uncapped.

## Skill routing
When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
