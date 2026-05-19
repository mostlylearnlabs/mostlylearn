// TypeScript types for the MostlyLearn Workers service

// ─── Google Sheets row types ───────────────────────────────

export interface StudentRow {
  studentName: string;
  phone: string;
  email: string;
  subject: string;
  level: string;
  timezone: string;
  status: 'lead' | 'demo_scheduled' | 'active' | 'paused' | 'inactive';
  teacherAssigned: string;
  freeCredits: number;
  totalClasses: number;
  lastClassDate: string;
  notes: string;
}

export interface TeacherRow {
  teacherName: string;
  phone: string;
  email: string;
  subjects: string;
  qualifications: string;
  timezone: string;
  availability: string;
  status: 'pending_verification' | 'active' | 'backup' | 'inactive';
  totalClasses: number;
  rating: number;
  payoutPerClass: number;
  referralBonuses: number;
  notes: string;
}

export interface ClassRow {
  classId: string;
  studentName: string;
  studentPhone: string;
  teacherName: string;
  teacherPhone: string;
  subject: string;
  date: string;
  time: string;
  duration: number;
  status: 'scheduled' | 'completed' | 'cancelled' | 'no_show';
  paymentStatus: 'pending' | 'paid' | 'free_credit' | 'refunded' | 'disputed';
  amount: number;
  referralCode: string | null;
  teacherConfirmed: boolean;
  notes: string;
}

export interface ReferralRow {
  referrerName: string;
  referrerPhone: string;
  referrerType: 'student' | 'teacher';
  refereeName: string;
  refereePhone: string;
  referralCode: string;
  status: 'pending' | 'active' | 'completed';
  refereeFirstPaidClass: boolean;
  creditIssued: boolean;
  teacherPayoutDue: number;
  teacherPaid: boolean;
  createdAt: string;
}

export interface PayoutRow {
  teacherName: string;
  teacherPhone: string;
  weekStart: string;
  weekEnd: string;
  classesCompleted: number;
  classPayout: number;
  referralBonuses: number;
  totalPayout: number;
  status: 'pending' | 'paid' | 'disputed';
  paidAt: string;
  transactionRef: string;
}

// ─── Webhook types ─────────────────────────────────────────

export interface StripeEvent {
  id: string;
  type: string;
  data: {
    object: Record<string, unknown>;
  };
  created: number;
}

export interface WhatsAppWebhookPayload {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product: string;
        metadata: { display_phone_number: string; phone_number_id: string };
        contacts?: Array<{ profile: { name: string }; wa_id: string }>;
        messages?: Array<{
          from: string;
          id: string;
          timestamp: string;
          type: 'text' | 'interactive' | 'image' | 'document';
          text?: { body: string };
          interactive?: Record<string, unknown>;
        }>;
        statuses?: Array<{
          id: string;
          status: string;
          timestamp: string;
          recipient_id: string;
        }>;
      };
    }>;
  }>;
}

export interface CalendlyWebhookPayload {
  event: string;
  payload: {
    event_type: { uuid: string; name: string };
    scheduling_url: string;
    invitee: {
      uuid: string;
      email: string;
      name: string;
      timezone: string;
      questions_and_answers: Array<{ question: string; answer: string }>;
    };
    event: {
      uuid: string;
      start_time: string;
      end_time: string;
      location: { type: string; location: string };
    };
    questions_and_answers: Array<{ question: string; answer: string }>;
  };
  created_at: string;
}

// ─── Referral types ────────────────────────────────────────

export interface ReferralRequest {
  referral_code: string;
  referee_name: string;
  referee_phone: string;
  referee_email?: string;
}

export interface ReferralValidationResult {
  isValid: boolean;
  referrerType?: 'student' | 'teacher';
  referrerName?: string;
  error?: string;
}
