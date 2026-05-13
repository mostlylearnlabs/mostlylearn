# MostlyLearn Track A — Operations SOP

## Overview
This SOP documents every workflow for running the WhatsApp-Native Tutoring Ops OS
as a solo founder. Follow these steps exactly. When a step breaks, that's what
you automate next.

## Student Journey

### 1. Lead Arrives (Daily)
- Student WhatsApps MostlyLearn number
- Worker logs lead to Sheet (Students tab), sends Calendly booking link
- **Founder action:** Check "Unresponded Leads" column daily. If >24hrs old, follow up manually.

### 2. Demo Scheduled
- Student books on Calendly → Worker updates Sheet
- Founder assigns teacher from available pool in Teachers tab
- Teacher notified via WhatsApp with student details and demo time
- Teacher conducts demo on Google Meet
- Teacher marks demo outcome in WhatsApp (confirmed / not interested / reschedule)

### 3. Booking Confirmed
- Founder confirms booking in Sheet → frequency, day, time per week
- Worker checks student free_credits:
  - If > 0: send "You have a free credit! This class is on us." message. Deduct credit.
  - If 0: send Stripe Payment Link via WhatsApp

### 4. Payment (Stripe)
- Student pays via Stripe card link
- Stripe sends webhook to Workers /api/stripe
- Worker deduplicates by event ID (checks PROCESSED_EVENTS in KV)
- Worker logs payment to Sheet, marks class as paid
- Worker checks if this is first paid class for referee → triggers referral credit
- Teacher notified to conduct class

### 5. Class Conducted
- Teacher conducts class on Google Meet
- Teacher marks complete in WhatsApp
- Worker logs completion to Sheet

### 6. Weekly Reconciliation (Founder, every Friday)
1. Check Sheet for all completed classes this week
2. Calculate teacher payouts: GBP 8 x completed classes + INR 500 per teacher referral
3. Process Wise batch payment to each teacher
4. Mark paid in Teachers tab
5. Review quality ratings. Follow up on any < 4.0 ratings.

## Teacher Onboarding

### Week 1 Assignment: Onboard 5 Teachers Manually
1. Pick 5 candidates from the 800 list (prioritize IIT/NIT/doctor with teaching experience)
2. WhatsApp each candidate: explain the model (flexible hours, GBP 8/class, zero mark-up)
3. Request credential verification: upload degree/teaching cert to Google Drive
4. Share Calendly availability poll → collect their teaching slots (UK/US timezone aware)
5. Conduct 30-min Google Meet SOP training: how to do demos, how to mark completion, conduct expectations
6. Add teacher to Sheet (Teachers tab), mark as active
7. Repeat: 5-10 teachers per week thereafter

### Teacher Classification
- Teachers are independent contractors (set own hours, choose own students)
- Verify Indian labor law before onboarding teacher #10
- Payout: weekly net-7 via Wise

## Referral System

### Referral Code Format
- Student: ML-{phone_last4}
- Teacher: ML-T{teacher_id}
- URL format for Track B: mostlylearn.com/ref=CODE

### Credit Flow
1. New student signs up and mentions referral code
2. Worker logs referral to Referrals tab (status: pending)
3. Referee books and completes first paid class
4. Worker marks referral as completed
5. If referrer is student: add 1 to free_credits in Students tab
6. If referrer is teacher: add INR 500 to their weekly payout total

### Abuse Prevention
- Self-referral blocked (same phone number check)
- First code used wins (one referrer per student)
- Free credit only awarded after referees first paid class
- Uncapped per person

## Failure Mode Responses

### Chargeback (Student disputes payment)
1. Stripe notifies of chargeback
2. Check class completion evidence in Sheet (teacher confirmed attendance)
3. If student attended: dispute with Stripe using completion evidence
4. If chargeback lost: subtract GBP 8 from teachers next payout (shared loss: GBP 4 teacher + GBP 4 platform)
5. Block student from future bookings until resolved

### Payout Delay (Wise transfer delayed 1-3 days)
1. Communicate clearly in teacher onboarding: "Weekly net-7 via Wise"
2. If teacher reports non-receipt after 7 business days, check Wise transaction status
3. Provide screenshot of Wise payment confirmation to teacher
4. If Wise fails, pay via PayPal as backup

### Referral Fraud (Same person multiple codes)
1. Cross-check referee phone number against existing students in Sheet
2. If same phone found: mark referral as fraud, do not issue credit
3. Lock referrers phone to prevent re-registration

### Teacher No-Show
1. Student notifies founder via WhatsApp
2. Call backup teacher from pool (2-3 per subject maintained in Sheet)
3. Offer student 50% discount on next class
4. If teacher no-shows >2 times, remove from active pool

## Daily Founder Flow (Weeks 1-4)

### Morning (15 min)
- Check Sheet for new student signups (Unresponded Leads column)
- Assign available teachers to pending demos
- Verify payments from overnight Stripe activity

### Midday (15 min)
- Monitor scheduled demos (teachers handle these)
- Approve pending teacher verifications
- Check /api/logs endpoint for any webhook failures

### Evening (10 min)
- Review class completion confirmations
- Approve pending payouts
- Follow up on no-shows

### Weekly (1-2 hours)
- Onboard 5-10 teachers from 800 list
- Reconcile Wise payouts
- Review quality ratings
- Run dead-letter queue recovery (review unprocessed Stripe events)
