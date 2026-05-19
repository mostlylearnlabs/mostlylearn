// Admin dashboard — real-time metrics for the founder

import type { Env } from './index';
import { jsonResponse } from './index';
import { log, getRecentLogs } from './utils';
import { getStudents, getTeachers, getClasses, getReferrals } from './sheets';

export async function handleAdminRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const view = url.searchParams.get('view') || 'summary';

  if (env.TEST_MODE === 'true') {
    return jsonResponse({
      environment: env.ENVIRONMENT,
      testMode: true,
      message: 'Admin API in test mode',
    });
  }

  try {
    switch (view) {
      case 'summary':
        return handleSummary(env);
      case 'students':
        return handleStudents(env);
      case 'teachers':
        return handleTeachers(env);
      case 'classes':
        return handleClasses(env);
      case 'logs':
        return jsonResponse({ logs: getRecentLogs(100) });
      case 'queue':
        return handleQueue(env);
      case 'payouts':
        return handlePayouts(env);
      case 'referrals':
        return handleReferrals(env);
      default:
        return jsonResponse({ error: 'Unknown view. Options: summary, students, teachers, classes, logs, queue, payouts, referrals' }, 400);
    }
  } catch (err) {
    log('admin', view, 'error', err instanceof Error ? err.message : 'Unknown');
    return jsonResponse({ error: 'Failed to fetch data' }, 500);
  }
}

async function handleSummary(env: Env): Promise<Response> {
  const students = await getStudents(env);
  const teachers = await getTeachers(env);
  const classes = await getClasses(env);

  // Skip header rows (index 0)
  const studentData = students.slice(1);
  const teacherData = teachers.slice(1);
  const classData = classes.slice(1);

  const activeStudents = studentData.filter((r) => r[6] === 'active' || r[6] === 'demo_scheduled');
  const activeTeachers = teacherData.filter((r) => r[7] === 'active' || r[7] === 'backup');
  const todayClasses = classData.filter((r) => {
    const classDate = r[6] as string || '';
    return classDate === new Date().toISOString().split('T')[0];
  });
  const completedClasses = classData.filter((r) => r[8] === 'completed');
  const totalRevenue = completedClasses.reduce((sum, r) => sum + (parseFloat(r[10] as string) || 0), 0);

  return jsonResponse({
    environment: env.ENVIRONMENT,
    asOf: new Date().toISOString(),
    summary: {
      totalStudents: studentData.length,
      activeStudents: activeStudents.length,
      totalTeachers: teacherData.length,
      activeTeachers: activeTeachers.length,
      totalClasses: classData.length,
      todayClasses: todayClasses.length,
      completedClasses: completedClasses.length,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
    },
  });
}

async function handleStudents(env: Env): Promise<Response> {
  const students = await getStudents(env);
  const data = students.slice(1).map((row, i) => ({
    id: i + 1,
    name: row[0],
    phone: row[1],
    email: row[2],
    subject: row[3],
    timezone: row[5],
    status: row[6],
    teacherAssigned: row[7],
    freeCredits: row[8],
    totalClasses: row[9],
    lastClass: row[10],
    notes: row[11],
  }));
  return jsonResponse({ count: data.length, students: data });
}

async function handleTeachers(env: Env): Promise<Response> {
  const teachers = await getTeachers(env);
  const data = teachers.slice(1).map((row, i) => ({
    id: i + 1,
    name: row[0],
    phone: row[1],
    email: row[2],
    subjects: row[3],
    qualifications: row[4],
    timezone: row[5],
    status: row[6],
    totalClasses: row[7],
    rating: row[8],
    payoutPerClass: row[9],
    referralBonuses: row[10],
  }));
  return jsonResponse({ count: data.length, teachers: data });
}

async function handleClasses(env: Env): Promise<Response> {
  const classes = await getClasses(env);
  const data = classes.slice(1).map((row, i) => ({
    id: row[0] || `class_${i}`,
    student: row[1],
    studentPhone: row[2],
    teacher: row[3],
    subject: row[5],
    date: row[6],
    time: row[7],
    status: row[8],
    paymentStatus: row[9],
    amount: row[10],
    referralCode: row[11],
    teacherConfirmed: row[12],
  }));
  return jsonResponse({ count: data.length, classes: data });
}

async function handleQueue(env: Env): Promise<Response> {
  // Read dead-letter queue stats
  const dlqList = await env.DEAD_LETTER_QUEUE.list({ prefix: 'failed_' });
  const chargebackList = await env.DEAD_LETTER_QUEUE.list({ prefix: 'chargeback_' });

  return jsonResponse({
    deadLetterQueue: dlqList.keys.length,
    chargebacks: chargebackList.keys.length,
    totalPending: dlqList.keys.length + chargebackList.keys.length,
  });
}

async function handlePayouts(env: Env): Promise<Response> {
  const classes = await getClasses(env);
  const classData = classes.slice(1);
  const completedThisWeek = classData.filter((r) => {
    const d = new Date(r[6] as string);
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return r[8] === 'completed' && d >= weekAgo;
  });

  return jsonResponse({
    weekStart: new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0],
    weekEnd: new Date().toISOString().split('T')[0],
    completedClasses: completedThisWeek.length,
    estimatedPayout: completedThisWeek.length * 8,
    platformRevenue: completedThisWeek.length * 4,
  });
}

async function handleReferrals(env: Env): Promise<Response> {
  const referrals = await getReferrals(env);
  const data = referrals.slice(1).map((row, i) => ({
    id: i + 1,
    referrer: row[0],
    referrerPhone: row[1],
    referrerType: row[2],
    referee: row[3],
    refereePhone: row[4],
    code: row[5],
    status: row[6],
    creditIssued: row[8],
    teacherPayoutDue: row[9],
  }));
  return jsonResponse({ count: data.length, referrals: data });
}
