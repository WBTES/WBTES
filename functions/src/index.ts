import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import nodemailer from "nodemailer";

admin.initializeApp();
const db = admin.firestore();

// ====================================================================
// 1. Auto open/close evaluation periods based on start/end dates
// Runs every 5 minutes.
// ====================================================================
export const autoOpenClosePeriods = functions.pubsub
  .schedule("every 5 minutes")
  .onRun(async () => {
    const now = Date.now();
    const periods = await db.collection("evaluationPeriods").get();
    const batch = db.batch();
    let updates = 0;
    const openedPeriodIds: string[] = [];
    const closedPeriodIds: string[] = [];

    for (const p of periods.docs) {
      const data = p.data();
      const status = data.status;
      if (status === "scheduled" && data.startDate <= now) {
        batch.update(p.ref, { status: "open", updatedAt: now });
        updates++;
        openedPeriodIds.push(p.id);
      } else if (status === "open" && data.endDate <= now) {
        batch.update(p.ref, { status: "closed", updatedAt: now });
        updates++;
        closedPeriodIds.push(p.id);
      }
    }

    if (updates > 0) await batch.commit();
    for (const periodId of openedPeriodIds) await onPeriodOpened(periodId);
    for (const periodId of closedPeriodIds) await onPeriodClosed(periodId);
    console.log(`Periods updated: ${updates}`);
  });

async function onPeriodOpened(periodId: string) {
  const [period, assignments] = await Promise.all([
    db.collection("evaluationPeriods").doc(periodId).get(),
    db.collection("teacherAssignments").where("periodId", "==", periodId).get(),
  ]);
  const studentIds = new Set<string>();
  assignments.docs.forEach((assignment) => {
    const ids = assignment.data().studentIds;
    if (Array.isArray(ids)) ids.forEach((studentId) => studentIds.add(String(studentId)));
  });
  const students = await getUserDocuments([...studentIds]);
  const periodData = period.data();
  const periodName = String(periodData?.name ?? "the current evaluation period");
  const body = `Your teacher evaluations for ${periodName} are ready. Complete them before the deadline.`;

  for (let i = 0; i < students.length; i += 500) {
    const batch = db.batch();
    students.slice(i, i + 500).forEach((student) => {
      const ref = db.collection("notifications").doc(`evaluation_open_${periodId}_${student.id}`);
      batch.set(ref, {
        userId: student.id,
        type: "evaluation_open" as const,
        title: "Evaluation period is now open",
        body,
        read: false,
        createdAt: Date.now(),
        link: "/student/evaluations",
      }, { merge: true });
    });
    await batch.commit();
  }
  await sendOptionalEmails(students.map((student) => ({
    to: String(student.data()?.email ?? ""),
    subject: "Evaluation period is now open",
    text: body,
  })));
}

async function getUserDocuments(userIds: string[]) {
  const users: FirebaseFirestore.DocumentSnapshot[] = [];
  for (let i = 0; i < userIds.length; i += 500) {
    const refs = userIds.slice(i, i + 500).map((userId) => db.collection("users").doc(userId));
    if (refs.length > 0) users.push(...await db.getAll(...refs));
  }
  return users.filter((user) => user.exists && user.data()?.status !== "disabled");
}

async function onPeriodClosed(periodId: string) {
  await generatePerformanceReports(periodId);

  const notif = {
    type: "result" as const,
    title: "Evaluation period closed",
    body: "Results are now available.",
    read: false,
    createdAt: Date.now(),
    link: `/department/reports`,
  };
  const heads = await db.collection("users").where("role", "==", "department_head").get();
  for (let i = 0; i < heads.docs.length; i += 500) {
    const batch = db.batch();
    heads.docs.slice(i, i + 500).forEach((t) => {
      const ref = db.collection("notifications").doc();
      batch.set(ref, { ...notif, userId: t.id });
    });
    await batch.commit();
  }
  await sendOptionalEmails(heads.docs.map((head) => ({
    to: String(head.data().email ?? ""),
    subject: "Evaluation period closed",
    text: "Results are now available in your department reports.",
  })));
}

async function generatePerformanceReports(periodId: string) {
  const [evals, questionsSnap, teachersSnap, subjectsSnap] = await Promise.all([
    db.collection("evaluations").where("periodId", "==", periodId).get(),
    db.collection("evaluationQuestions").get(),
    db.collection("teachers").get(),
    db.collection("subjects").get(),
  ]);
  const questionCategories = new Map<string, string>();
  questionsSnap.docs.forEach((doc) => {
    const data = doc.data();
    questionCategories.set(doc.id, String(data.category ?? "Uncategorized"));
  });
  const userNames = new Map<string, string>();
  teachersSnap.docs.forEach((doc) => userNames.set(doc.id, String(doc.data().displayName ?? "Teacher")));
  const subjectNames = new Map<string, string>();
  subjectsSnap.docs.forEach((doc) => subjectNames.set(doc.id, String(doc.data().name ?? "Subject")));

  const groups = new Map<string, FirebaseFirestore.QueryDocumentSnapshot[]>();

  evals.docs.forEach((doc) => {
    const data = doc.data();
    const key = `${data.teacherId}|${data.subjectId}`;
    const list = groups.get(key) ?? [];
    list.push(doc);
    groups.set(key, list);
  });

  for (const [key, docs] of groups.entries()) {
    const [teacherId, subjectId] = key.split("|");
    const first = docs[0].data();
    const total = docs.length;
    const averageScore = docs.reduce((sum, doc) => sum + (doc.data().averageScore ?? 0), 0) / total;
    const comments = docs
      .map((doc) => String(doc.data().comment ?? "").trim())
      .filter(Boolean)
      .slice(0, 25);
    const categoryAverages = computeCategoryAverages(docs, questionCategories);
    const ratingLabel =
      averageScore >= 4.5 ? "Excellent" :
      averageScore >= 4 ? "Very good" :
      averageScore >= 3 ? "Satisfactory" :
      "Needs support";
    const fallbackAnalysis = buildFallbackAnalysis(averageScore, total, comments, categoryAverages);
    const aiAnalysis = await generateAiAnalysis({
      teacherName: userNames.get(teacherId) ?? "Teacher",
      subjectName: subjectNames.get(subjectId) ?? "Subject",
      averageScore,
      totalEvaluations: total,
      comments,
      categoryAverages,
      fallback: fallbackAnalysis,
    });

    await db.collection("performanceReports").doc(`${periodId}_${teacherId}_${subjectId}`).set({
      periodId,
      teacherId,
      subjectId,
      departmentId: first.departmentId,
      totalEvaluations: total,
      averageScore,
      ratingLabel,
      comments,
      categoryAverages,
      summary: aiAnalysis.summary,
      strengths: aiAnalysis.strengths,
      recommendations: aiAnalysis.recommendations,
      graphInsights: aiAnalysis.graphInsights,
      aiGenerated: aiAnalysis.aiGenerated,
      analysisProvider: aiAnalysis.provider,
      generatedAt: Date.now(),
    }, { merge: true });
  }
}

type CategoryAverage = { category: string; average: number; count: number };

type ReportAnalysis = {
  summary: string;
  strengths: string[];
  recommendations: string[];
  graphInsights: string[];
  aiGenerated: boolean;
  provider: "gemini" | "rules";
};

function computeCategoryAverages(
  docs: FirebaseFirestore.QueryDocumentSnapshot[],
  questionCategories: Map<string, string>
): CategoryAverage[] {
  const grouped = new Map<string, { total: number; count: number }>();
  docs.forEach((doc) => {
    const ratings = doc.data().ratings ?? {};
    Object.entries(ratings).forEach(([questionId, value]) => {
      if (typeof value !== "number") return;
      const category = questionCategories.get(questionId) ?? "Uncategorized";
      const item = grouped.get(category) ?? { total: 0, count: 0 };
      item.total += value;
      item.count += 1;
      grouped.set(category, item);
    });
  });
  return Array.from(grouped.entries())
    .map(([category, item]) => ({
      category,
      average: Number((item.total / item.count).toFixed(2)),
      count: item.count,
    }))
    .sort((a, b) => b.average - a.average);
}

function buildFallbackAnalysis(
  averageScore: number,
  totalEvaluations: number,
  comments: string[],
  categoryAverages: CategoryAverage[]
): ReportAnalysis {
  const ratingLabel =
    averageScore >= 4.5 ? "Excellent" :
    averageScore >= 4 ? "Very good" :
    averageScore >= 3 ? "Satisfactory" :
    averageScore > 0 ? "Needs support" :
    "No data";
  const strongest = categoryAverages[0];
  const weakest = categoryAverages[categoryAverages.length - 1];
  const graphInsights = [
    strongest ? `${strongest.category} is the strongest category at ${strongest.average.toFixed(2)}.` : "No category scores are available yet.",
    weakest && weakest !== strongest ? `${weakest.category} is the lowest category at ${weakest.average.toFixed(2)}.` : "Category ratings are balanced for the available data.",
  ];
  return {
    summary: totalEvaluations === 0
      ? "No submitted evaluations are available for this teacher and subject yet."
      : `${ratingLabel} performance with an average rating of ${averageScore.toFixed(2)} across ${totalEvaluations} submitted evaluation${totalEvaluations === 1 ? "" : "s"}.`,
    strengths: [
      strongest ? `Strongest category: ${strongest.category}` : "Evaluation data is available for review",
      comments.length > 0 ? "Students provided qualitative comments for context" : "Ratings are available for quantitative review",
    ],
    recommendations: [
      weakest && weakest.average < 4
        ? `Plan targeted improvement for ${weakest.category}`
        : "Maintain effective teaching practices and document what works",
      comments.length > 0 ? "Review repeated themes in anonymous comments" : "Encourage students to leave constructive comments",
    ],
    graphInsights,
    aiGenerated: false,
    provider: "rules",
  };
}

async function generateAiAnalysis(input: {
  teacherName: string;
  subjectName: string;
  averageScore: number;
  totalEvaluations: number;
  comments: string[];
  categoryAverages: CategoryAverage[];
  fallback: ReportAnalysis;
}): Promise<ReportAnalysis> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) return input.fallback;

  const prompt = [
    "You are helping a school summarize anonymous teacher evaluation results.",
    "Return only valid JSON with keys: summary, strengths, recommendations, graphInsights.",
    "Each list must contain 2 to 4 concise strings. Do not identify students. Be professional and constructive.",
    JSON.stringify({
      teacher: input.teacherName,
      subject: input.subjectName,
      averageScore: input.averageScore,
      totalEvaluations: input.totalEvaluations,
      categoryAverages: input.categoryAverages,
      anonymousComments: input.comments.slice(0, 12),
    }),
  ].join("\n");

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json",
          },
        }),
      }
    );
    if (!res.ok) {
      console.warn(`Gemini analysis failed: ${res.status} ${await res.text()}`);
      return input.fallback;
    }
    const data = await res.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return input.fallback;
    const parsed = JSON.parse(text) as Partial<ReportAnalysis>;
    return {
      summary: typeof parsed.summary === "string" ? parsed.summary : input.fallback.summary,
      strengths: normalizeStringList(parsed.strengths, input.fallback.strengths),
      recommendations: normalizeStringList(parsed.recommendations, input.fallback.recommendations),
      graphInsights: normalizeStringList(parsed.graphInsights, input.fallback.graphInsights),
      aiGenerated: true,
      provider: "gemini",
    };
  } catch (err) {
    console.warn("Gemini analysis error:", err);
    return input.fallback;
  }
}

function normalizeStringList(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback;
  const list = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  return list.length > 0 ? list.slice(0, 4) : fallback;
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function getGeminiApiKey() {
  const configured = functions.config()?.gemini?.key;
  return process.env.GEMINI_API_KEY || configured || "";
}

function getConfigValue(section: string, key: string, envName: string) {
  const configured = functions.config()?.[section]?.[key];
  return process.env[envName] || configured || "";
}

// ====================================================================
// 2. Send deadline reminders (1 day before end)
// Runs daily at 9 AM.
// ====================================================================
export const sendDeadlineReminders = functions.pubsub
  .schedule("0 9 * * *")
  .timeZone("Asia/Manila")
  .onRun(async () => {
    const tomorrow = Date.now() + 24 * 60 * 60 * 1000;
    const periods = await db.collection("evaluationPeriods")
      .where("status", "==", "open")
      .get();

    for (const p of periods.docs) {
      const data = p.data();
      if (data.endDate > tomorrow || data.endDate <= Date.now()) continue;

      const assigns = await db.collection("teacherAssignments")
        .where("periodId", "==", p.id)
        .get();
      const assignmentsByStudent = new Map<string, string[]>();
      assigns.docs.forEach((assignment) => {
        const ids = assignment.data().studentIds;
        if (!Array.isArray(ids)) return;
        ids.forEach((studentId: string) => {
          assignmentsByStudent.set(studentId, [...(assignmentsByStudent.get(studentId) ?? []), assignment.id]);
        });
      });

      const submitted = await db.collection("evaluationCompletions")
        .where("periodId", "==", p.id)
        .get();
      const completedAssignments = new Set(
        submitted.docs.map((completion) => `${completion.data().studentId}|${completion.data().assignmentId}`)
      );

      const pending = [...assignmentsByStudent.entries()]
        .filter(([studentId, assignmentIds]) => assignmentIds.some((assignmentId) => !completedAssignments.has(`${studentId}|${assignmentId}`)))
        .map(([studentId]) => studentId);
      const pendingUsers = await getUserDocuments(pending);

      for (let i = 0; i < pendingUsers.length; i += 500) {
        const batch = db.batch();
        pendingUsers.slice(i, i + 500).forEach((student) => {
          const ref = db.collection("notifications").doc(`deadline_${p.id}_${student.id}`);
          batch.set(ref, {
            userId: student.id,
            type: "deadline" as const,
            title: "Evaluation deadline tomorrow",
            body: `Complete your remaining teacher evaluations for ${data.name}.`,
            read: false,
            createdAt: Date.now(),
            link: "/student/evaluations",
          }, { merge: true });
        });
        await batch.commit();
      }
      await sendOptionalEmails(pendingUsers.map((student) => ({
        to: String(student.data()?.email ?? ""),
        subject: "Evaluation deadline tomorrow",
        text: `Don't forget to complete your evaluations for ${data.name}.`,
      })));
      console.log(`Sent ${pendingUsers.length} deadline reminders for ${data.name}`);
    }
  });

// ====================================================================
// 3. Publish, expire, and deliver targeted announcements
// ====================================================================
export const updateAnnouncementLifecycle = functions.pubsub
  .schedule("every 5 minutes")
  .onRun(async () => {
    const now = Date.now();
    const announcements = await db.collection("announcements").get();
    const updates = announcements.docs.flatMap((announcement) => {
      const data = announcement.data();
      if (data.status === "scheduled" && data.publishAt <= now && (!data.expiresAt || data.expiresAt > now)) {
        return [{ ref: announcement.ref, status: "published" }];
      }
      if (data.status === "published" && data.expiresAt && data.expiresAt <= now) {
        return [{ ref: announcement.ref, status: "expired" }];
      }
      return [];
    });

    for (let i = 0; i < updates.length; i += 500) {
      const batch = db.batch();
      updates.slice(i, i + 500).forEach((update) => {
        batch.update(update.ref, { status: update.status, updatedAt: now });
      });
      await batch.commit();
    }
    console.log(`Announcement lifecycle updates: ${updates.length}`);
  });

export const onAnnouncementWrite = functions.firestore
  .document("announcements/{announcementId}")
  .onWrite(async (change, context) => {
    if (!change.after.exists) return;
    const announcement = change.after.data();
    if (!announcement) return;
    const now = Date.now();
    const status = announcement.status ?? "published";
    if (
      status !== "published"
      || announcement.notifiedAt
      || (announcement.publishAt && announcement.publishAt > now)
      || (announcement.expiresAt && announcement.expiresAt <= now)
    ) return;

    const audience = announcement.audience;
    const usersSnapshot = audience !== "all"
      ? await db.collection("users").where("role", "==", audience).get()
      : await db.collection("users").get();
    const users = usersSnapshot.docs.filter((user) => {
      const profile = user.data();
      if (profile.status === "disabled") return false;
      const target = announcement.target;
      if (audience !== "student" || !target) return true;
      if (target.departmentId && target.departmentId !== profile.departmentId) return false;
      if (target.programId) {
        if (profile.programId && target.programId !== profile.programId) return false;
        if (!profile.programId && (!target.course || normalizeText(target.course) !== normalizeText(profile.course))) return false;
      } else if (target.course && normalizeText(target.course) !== normalizeText(profile.course)) {
        return false;
      }
      if (target.yearLevel && target.yearLevel !== profile.yearLevel) return false;
      if (target.section && target.section !== profile.section) return false;
      return true;
    });
    const defaultLinks: Record<string, string> = {
      admin: "/admin/announcements",
      student: "/student/announcements",
      department_head: "/department/announcements",
    };

    for (let i = 0; i < users.length; i += 500) {
      const batch = db.batch();
      users.slice(i, i + 500).forEach((user) => {
        const role = String(user.data().role ?? "");
        const ref = db.collection("notifications").doc(`announcement_${context.params.announcementId}_${user.id}`);
        batch.set(ref, {
          userId: user.id,
          type: "announcement" as const,
          title: String(announcement.title ?? "New announcement"),
          body: String(announcement.body ?? ""),
          read: false,
          createdAt: now,
          link: typeof announcement.actionLink === "string" && announcement.actionLink.startsWith("/")
            ? announcement.actionLink
            : defaultLinks[role] ?? "/dashboard",
        }, { merge: true });
      });
      await batch.commit();
    }

    if (announcement.sendEmail === true) {
      await sendOptionalEmails(users.map((user) => ({
        to: String(user.data().email ?? ""),
        subject: String(announcement.title ?? "New announcement"),
        text: String(announcement.body ?? ""),
      })));
    }
    await change.after.ref.update({ notifiedAt: now, updatedAt: now });
  });

async function sendOptionalEmails(messages: Array<{ to: string; subject: string; text: string }>) {
  const host = process.env.SMTP_HOST?.trim() ?? "";
  const port = Number(process.env.SMTP_PORT ?? "587");
  const user = process.env.SMTP_USER?.trim() ?? "";
  const pass = process.env.SMTP_PASS ?? "";
  const fromEmail = process.env.SMTP_FROM_EMAIL?.trim() || user;
  const fromName = process.env.SMTP_FROM_NAME?.trim() || "WBTE";
  const secure = process.env.SMTP_SECURE
    ? process.env.SMTP_SECURE.toLowerCase() === "true"
    : port === 465;
  const valid = messages.filter((message) => message.to.includes("@"));
  const configured = Boolean(host && user && pass && fromEmail && Number.isFinite(port));
  if (!configured || valid.length === 0) return { configured, sent: 0, failed: valid.length };

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    pool: true,
    maxConnections: 3,
    connectionTimeout: 15000,
    socketTimeout: 30000,
  });

  let sent = 0;
  let failed = 0;
  try {
    for (let i = 0; i < valid.length; i += 20) {
      const results = await Promise.allSettled(
        valid.slice(i, i + 20).map((message) =>
          transporter.sendMail({
            from: { name: fromName, address: fromEmail },
            to: message.to,
            subject: message.subject,
            text: message.text,
          })
        )
      );
      const failures = results.filter((result) => result.status === "rejected");
      sent += results.length - failures.length;
      failed += failures.length;
      if (failures.length > 0) console.error(`SMTP email failures: ${failures.length}`);
    }
  } finally {
    transporter.close();
  }
  return { configured, sent, failed };
}

// ====================================================================
// 4. Server-written activity logs
// ====================================================================
export const recordActivityLog = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Sign in first.");
  }
  const action = typeof data?.action === "string" ? data.action : "activity";
  const metadata = data?.metadata && typeof data.metadata === "object" ? data.metadata : {};
  await db.collection("activityLogs").add({
    userId: context.auth.uid,
    action,
    metadata,
    createdAt: Date.now(),
  });
  return { ok: true };
});

export const sendSmtpTestEmail = functions.https.onCall(async (_data, context) => {
  await assertAdmin(context);
  const profile = await db.collection("users").doc(context.auth!.uid).get();
  const email = String(profile.data()?.email ?? context.auth!.token.email ?? "");
  if (!email.includes("@")) {
    throw new functions.https.HttpsError("failed-precondition", "Your administrator profile has no valid email address.");
  }
  const result = await sendOptionalEmails([{
    to: email,
    subject: "WBTE SMTP test",
    text: "Your WBTE SMTP email configuration is working correctly.",
  }]);
  if (!result.configured) {
    throw new functions.https.HttpsError("failed-precondition", "SMTP is not configured in the Functions environment.");
  }
  if (result.failed > 0) {
    throw new functions.https.HttpsError("internal", "The SMTP server rejected the test email. Check the Functions logs.");
  }
  return { ok: true, sentTo: email };
});

export const setEvaluationPeriodStatus = functions.https.onCall(async (data, context) => {
  await assertAdmin(context);
  const periodId = typeof data?.periodId === "string" ? data.periodId : "";
  const status = typeof data?.status === "string" ? data.status : "";
  if (!periodId || !["draft", "scheduled", "open", "closed"].includes(status)) {
    throw new functions.https.HttpsError("invalid-argument", "Invalid period status request.");
  }
  const ref = db.collection("evaluationPeriods").doc(periodId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new functions.https.HttpsError("not-found", "Evaluation period not found.");
  }
  const previous = snap.data()?.status;
  await ref.update({ status, updatedAt: Date.now() });
  if (previous !== status && status === "open") {
    await onPeriodOpened(periodId);
  }
  if (previous !== status && status === "closed") {
    await onPeriodClosed(periodId);
  }
  return { ok: true };
});

async function assertAdmin(context: functions.https.CallableContext) {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Sign in first.");
  }
  const user = await db.collection("users").doc(context.auth.uid).get();
  if (user.data()?.role !== "admin") {
    throw new functions.https.HttpsError("permission-denied", "Admin access required.");
  }
}
