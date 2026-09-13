import "server-only";

import type {
  DocumentData,
  DocumentSnapshot,
  QueryDocumentSnapshot,
} from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { isSmtpConfigured, sendSmtpEmails, type EmailMessage } from "@/lib/email/smtp";
import {
  analyzeWeightedComments,
  consolidateComments,
} from "@/lib/comment-analysis";
import { ApiError } from "@/lib/server/require-admin";
import type {
  CommentAnalysis,
  PerformanceTrendPoint,
} from "@/lib/types";

type PeriodStatus = "draft" | "scheduled" | "open" | "closed";

type CategoryAverage = {
  category: string;
  average: number;
  count: number;
};

type ReportAnalysis = {
  summary: string;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  graphInsights: string[];
  commentAnalysis: CommentAnalysis;
  aiGenerated: boolean;
  provider: "gemini" | "rules";
};

type DeliveryResult = {
  notified: number;
  emailed: number;
  reports: number;
  warnings: string[];
};

export type PeriodStatusResult = DeliveryResult & {
  changed: boolean;
  previousStatus: PeriodStatus;
  status: "open" | "closed";
};

export async function setPeriodStatus(
  periodId: string,
  status: "open" | "closed",
  adminUid: string
): Promise<PeriodStatusResult> {
  const periodRef = adminDb.collection("evaluationPeriods").doc(periodId);
  const transition = await adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(periodRef);
    if (!snapshot.exists) throw new ApiError(404, "Evaluation period was not found.");

    const previousStatus = String(snapshot.data()?.status ?? "draft") as PeriodStatus;
    if (status === "open" && !["draft", "scheduled", "open"].includes(previousStatus)) {
      throw new ApiError(409, "A closed evaluation period cannot be reopened.");
    }
    if (status === "closed" && !["open", "closed"].includes(previousStatus)) {
      throw new ApiError(409, "Only an open evaluation period can be closed.");
    }

    const changed = previousStatus !== status;
    if (changed) {
      transaction.update(periodRef, {
        status,
        updatedAt: Date.now(),
      });
    }
    return {
      changed,
      previousStatus,
      periodName: String(snapshot.data()?.name ?? "Evaluation period"),
    };
  });

  const result: PeriodStatusResult = {
    changed: transition.changed,
    previousStatus: transition.previousStatus,
    status,
    notified: 0,
    emailed: 0,
    reports: 0,
    warnings: [],
  };

  if (transition.changed) {
    const delivery = status === "open"
      ? await deliverPeriodOpened(periodId, transition.periodName)
      : await deliverPeriodClosed(periodId);
    result.notified = delivery.notified;
    result.emailed = delivery.emailed;
    result.reports = delivery.reports;
    result.warnings.push(...delivery.warnings);
  }

  try {
    await adminDb.collection("activityLogs").add({
      userId: adminUid,
      action: `evaluation_period_${status}`,
      metadata: {
        periodId,
        previousStatus: transition.previousStatus,
        changed: transition.changed,
      },
      createdAt: Date.now(),
    });
  } catch (error) {
    result.warnings.push(`The status changed, but the audit log could not be recorded: ${errorMessage(error)}`);
  }

  return result;
}

async function deliverPeriodOpened(
  periodId: string,
  periodName: string
): Promise<DeliveryResult> {
  const result = emptyDeliveryResult();
  let students: DocumentSnapshot<DocumentData>[] = [];

  try {
    const assignments = await adminDb
      .collection("teacherAssignments")
      .where("periodId", "==", periodId)
      .get();
    const studentIds = new Set<string>();
    assignments.docs.forEach((assignment) => {
      const ids = assignment.data().studentIds;
      if (Array.isArray(ids)) {
        ids.forEach((studentId) => studentIds.add(String(studentId)));
      }
    });
    students = await getActiveUsers([...studentIds]);

    const message = `Your teacher evaluations for ${periodName} are ready. Complete them before the deadline.`;
    for (let index = 0; index < students.length; index += 500) {
      const batch = adminDb.batch();
      students.slice(index, index + 500).forEach((student) => {
        const notification = adminDb
          .collection("notifications")
          .doc(`evaluation_open_${periodId}_${student.id}`);
        batch.set(notification, {
          userId: student.id,
          type: "evaluation_open",
          title: "Evaluation period is now open",
          body: message,
          read: false,
          createdAt: Date.now(),
          link: "/student/evaluations",
        }, { merge: true });
      });
      await batch.commit();
    }
    result.notified = students.length;
  } catch (error) {
    result.warnings.push(`Student notifications could not be completed: ${errorMessage(error)}`);
  }

  const emailResult = await sendOptionalEmails(students.map((student) => ({
    to: String(student.data()?.email ?? ""),
    subject: "Evaluation period is now open",
    text: `Your teacher evaluations for ${periodName} are ready. Complete them before the deadline.`,
  })));
  result.emailed = emailResult.sent;
  if (emailResult.warning) result.warnings.push(emailResult.warning);
  if (students.length === 0) {
    result.warnings.push("No assigned students were found for this evaluation period.");
  }
  return result;
}

async function deliverPeriodClosed(periodId: string): Promise<DeliveryResult> {
  const result = emptyDeliveryResult();

  try {
    result.reports = await generatePerformanceReports(periodId);
  } catch (error) {
    result.warnings.push(`Performance reports could not be generated: ${errorMessage(error)}`);
  }

  let heads: QueryDocumentSnapshot<DocumentData>[] = [];
  try {
    const snapshot = await adminDb.collection("users").get();
    heads = snapshot.docs.filter(
      (head) => ["hr", "department_head"].includes(head.data().role)
        && (head.data().status ?? "active") === "active"
    );
    for (let index = 0; index < heads.length; index += 500) {
      const batch = adminDb.batch();
      heads.slice(index, index + 500).forEach((head) => {
        const notification = adminDb
          .collection("notifications")
          .doc(`evaluation_closed_${periodId}_${head.id}`);
        batch.set(notification, {
          userId: head.id,
          type: "result",
          title: "Evaluation period closed",
          body: "Results are now available.",
          read: false,
          createdAt: Date.now(),
          link: head.data().role === "hr" ? "/hr/reports" : "/department-head/reports",
        }, { merge: true });
      });
      await batch.commit();
    }
    result.notified = heads.length;
  } catch (error) {
    result.warnings.push(`Department staff notifications could not be completed: ${errorMessage(error)}`);
  }

  const emailResult = await sendOptionalEmails(heads.map((head) => ({
    to: String(head.data().email ?? ""),
    subject: "Evaluation period closed",
    text: "School-wide results are now available in your reports.",
  })));
  result.emailed = emailResult.sent;
  if (emailResult.warning) result.warnings.push(emailResult.warning);
  return result;
}

async function getActiveUsers(userIds: string[]) {
  const users: DocumentSnapshot<DocumentData>[] = [];
  for (let index = 0; index < userIds.length; index += 500) {
    const references = userIds
      .slice(index, index + 500)
      .map((userId) => adminDb.collection("users").doc(userId));
    if (references.length > 0) {
      users.push(...await adminDb.getAll(...references));
    }
  }
  return users.filter(
    (user) => user.exists && (user.data()?.status ?? "active") === "active"
  );
}

async function sendOptionalEmails(messages: EmailMessage[]) {
  const validMessages = messages.filter((message) => message.to.includes("@"));
  if (validMessages.length === 0) return { sent: 0 };
  if (!isSmtpConfigured()) {
    return {
      sent: 0,
      warning: "In-app notifications were created, but SMTP email is not configured.",
    };
  }
  try {
    const delivery = await sendSmtpEmails(validMessages);
    return { sent: delivery.sent };
  } catch (error) {
    return {
      sent: 0,
      warning: `In-app notifications were created, but email delivery failed: ${errorMessage(error)}`,
    };
  }
}

export async function generatePerformanceReports(periodId: string) {
  const [
    evaluations,
    allEvaluations,
    questions,
    teachers,
    subjects,
    periods,
    assignments,
  ] = await Promise.all([
    adminDb.collection("evaluations").where("periodId", "==", periodId).get(),
    adminDb.collection("evaluations").get(),
    adminDb.collection("evaluationQuestions").get(),
    adminDb.collection("teachers").get(),
    adminDb.collection("subjects").get(),
    adminDb.collection("evaluationPeriods").get(),
    adminDb.collection("teacherAssignments").where("periodId", "==", periodId).get(),
  ]);

  const assignedStudentIds = new Set<string>();
  assignments.docs.forEach((assignment) => {
    const studentIds = assignment.data().studentIds;
    if (Array.isArray(studentIds)) {
      studentIds.forEach((studentId) => assignedStudentIds.add(String(studentId)));
    }
  });
  const assignedStudents = await getActiveUsers([...assignedStudentIds]);
  const studentScopes = new Map(assignedStudents.map((student) => [student.id, {
    programId: String(student.data()?.programId ?? ""),
    yearLevel: String(student.data()?.yearLevel ?? ""),
    section: String(student.data()?.section ?? ""),
  }]));
  const assignmentScopes = new Map<string, {
    programIds: Set<string>;
    yearLevels: Set<string>;
    sections: Set<string>;
  }>();
  assignments.docs.forEach((assignment) => {
    const data = assignment.data();
    const key = `${data.teacherId}|${data.subjectId}`;
    const scope = assignmentScopes.get(key) ?? {
      programIds: new Set<string>(),
      yearLevels: new Set<string>(),
      sections: new Set<string>(),
    };
    const addValues = (target: Set<string>, values: unknown) => {
      if (!Array.isArray(values)) return;
      values.map(String).filter(Boolean).forEach((value) => target.add(value));
    };
    addValues(scope.programIds, data.programIds);
    addValues(scope.yearLevels, data.yearLevels);
    addValues(scope.sections, data.sections);
    if (Array.isArray(data.studentIds)) {
      data.studentIds.forEach((studentId: unknown) => {
        const student = studentScopes.get(String(studentId));
        if (!student) return;
        if (student.programId) scope.programIds.add(student.programId);
        if (student.yearLevel) scope.yearLevels.add(student.yearLevel);
        if (student.section) scope.sections.add(student.section);
      });
    }
    assignmentScopes.set(key, scope);
  });

  const questionCategories = new Map<string, string>();
  questions.docs.forEach((question) => {
    questionCategories.set(
      question.id,
      String(question.data().category ?? "Uncategorized")
    );
  });
  const teacherNames = new Map<string, string>();
  teachers.docs.forEach((teacher) => {
    teacherNames.set(
      teacher.id,
      String(teacher.data().displayName ?? "Teacher")
    );
  });
  const subjectNames = new Map<string, string>();
  subjects.docs.forEach((subject) => {
    subjectNames.set(
      subject.id,
      String(subject.data().name ?? "Subject")
    );
  });
  const periodDetails = new Map<string, {
    name: string;
    endDate: number;
  }>();
  periods.docs.forEach((period) => {
    periodDetails.set(period.id, {
      name: String(period.data().name ?? "Evaluation period"),
      endDate: Number(period.data().endDate ?? 0),
    });
  });

  const groups = new Map<string, QueryDocumentSnapshot<DocumentData>[]>();
  evaluations.docs.forEach((evaluation) => {
    const data = evaluation.data();
    const key = `${data.teacherId}|${data.subjectId}`;
    const group = groups.get(key) ?? [];
    group.push(evaluation);
    groups.set(key, group);
  });

  for (const [key, documents] of groups.entries()) {
    const [teacherId, subjectId] = key.split("|");
    const first = documents[0].data();
    const totalEvaluations = documents.length;
    const averageScore = documents.reduce(
      (sum, document) => sum + Number(document.data().averageScore ?? 0),
      0
    ) / totalEvaluations;
    const rawComments = documents
      .map((document) => String(document.data().comment ?? "").trim())
      .filter(Boolean)
      .slice(0, 500);
    const { uniqueComments: comments, analysis: commentAnalysis } =
      consolidateComments(rawComments);
    const weightedCommentAnalysis = analyzeWeightedComments(rawComments);
    const scope = assignmentScopes.get(key);
    const categoryAverages = computeCategoryAverages(
      documents,
      questionCategories
    );
    const trendHistory = computeTrendHistory(
      allEvaluations.docs.filter((document) => {
        const data = document.data();
        return data.teacherId === teacherId && data.subjectId === subjectId;
      }),
      periodDetails
    );
    const trendChange = trendHistory.length > 1
      ? Number((
          trendHistory[trendHistory.length - 1].average
          - trendHistory[trendHistory.length - 2].average
        ).toFixed(2))
      : 0;
    const fallback = buildFallbackAnalysis(
      averageScore,
      totalEvaluations,
      comments,
      categoryAverages,
      commentAnalysis
    );
    const analysis = await generateAiAnalysis({
      teacherName: teacherNames.get(teacherId) ?? "Teacher",
      subjectName: subjectNames.get(subjectId) ?? "Subject",
      averageScore,
      totalEvaluations,
      comments,
      categoryAverages,
      commentAnalysis,
      trendHistory,
      trendChange,
      fallback,
    });

    await adminDb
      .collection("performanceReports")
      .doc(`${periodId}_${teacherId}_${subjectId}`)
      .set({
        periodId,
        teacherId,
        subjectId,
        departmentId: first.departmentId,
        totalEvaluations,
        averageScore,
        ratingLabel: ratingLabel(averageScore),
        comments,
        categoryAverages,
        summary: analysis.summary,
        strengths: analysis.strengths,
        weaknesses: analysis.weaknesses,
        recommendations: analysis.recommendations,
        graphInsights: analysis.graphInsights,
        trendHistory,
        trendChange,
        commentAnalysis: analysis.commentAnalysis,
        weightedCommentAnalysis,
        programIds: [...(scope?.programIds ?? [])].sort(),
        yearLevels: [...(scope?.yearLevels ?? [])].sort(),
        sections: [...(scope?.sections ?? [])].sort(),
        aiGenerated: analysis.aiGenerated,
        analysisProvider: analysis.provider,
        generatedAt: Date.now(),
      }, { merge: true });
  }
  return groups.size;
}

function computeCategoryAverages(
  documents: QueryDocumentSnapshot<DocumentData>[],
  questionCategories: Map<string, string>
): CategoryAverage[] {
  const grouped = new Map<string, { total: number; count: number }>();
  documents.forEach((document) => {
    const ratings = document.data().ratings ?? {};
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

function computeTrendHistory(
  documents: QueryDocumentSnapshot<DocumentData>[],
  periods: Map<string, { name: string; endDate: number }>
): PerformanceTrendPoint[] {
  const grouped = new Map<string, { total: number; responses: number }>();
  documents.forEach((document) => {
    const data = document.data();
    const periodId = String(data.periodId ?? "");
    if (!periodId || !periods.has(periodId)) return;
    const item = grouped.get(periodId) ?? { total: 0, responses: 0 };
    item.total += Number(data.averageScore ?? 0);
    item.responses += 1;
    grouped.set(periodId, item);
  });
  return [...grouped.entries()]
    .map(([currentPeriodId, item]) => {
      const period = periods.get(currentPeriodId)!;
      return {
        periodId: currentPeriodId,
        periodName: period.name,
        endDate: period.endDate,
        average: Number((item.total / item.responses).toFixed(2)),
        responses: item.responses,
      };
    })
    .sort((a, b) => a.endDate - b.endDate);
}

function buildFallbackAnalysis(
  averageScore: number,
  totalEvaluations: number,
  comments: string[],
  categoryAverages: CategoryAverage[],
  commentAnalysis: CommentAnalysis
): ReportAnalysis {
  const strongest = categoryAverages[0];
  const weakest = categoryAverages[categoryAverages.length - 1];
  return {
    summary: totalEvaluations === 0
      ? "No submitted evaluations are available for this teacher and subject yet."
      : `${ratingLabel(averageScore)} performance with an average rating of ${averageScore.toFixed(2)} across ${totalEvaluations} submitted evaluation${totalEvaluations === 1 ? "" : "s"}.`,
    strengths: [
      strongest
        ? `Strongest category: ${strongest.category}`
        : "Evaluation data is available for review",
      comments.length > 0
        ? "Students provided qualitative comments for context"
        : "Ratings are available for quantitative review",
    ],
    weaknesses: [
      weakest
        ? `Lowest-rated category: ${weakest.category}`
        : "No rating weakness can be identified yet",
      commentAnalysis.areasForImprovement[0]
        ? `Common feedback theme: ${commentAnalysis.areasForImprovement[0]}`
        : "No recurring improvement theme was identified",
    ],
    recommendations: [
      weakest && weakest.average < 4
        ? `Plan targeted improvement for ${weakest.category}`
        : "Maintain effective teaching practices and document what works",
      comments.length > 0
        ? "Review repeated themes in anonymous comments"
        : "Encourage students to leave constructive comments",
    ],
    graphInsights: [
      strongest
        ? `${strongest.category} is the strongest category at ${strongest.average.toFixed(2)}.`
        : "No category scores are available yet.",
      weakest && weakest !== strongest
        ? `${weakest.category} is the lowest category at ${weakest.average.toFixed(2)}.`
        : "Category ratings are balanced for the available data.",
    ],
    commentAnalysis,
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
  commentAnalysis: CommentAnalysis;
  trendHistory: PerformanceTrendPoint[];
  trendChange: number;
  fallback: ReportAnalysis;
}): Promise<ReportAnalysis> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return input.fallback;
  const model = process.env.GEMINI_MODEL?.trim() || "gemini-3.1-flash-lite";

  const prompt = [
    "You are helping a school summarize anonymous teacher evaluation results.",
    "Return only valid JSON with keys: summary, strengths, weaknesses, recommendations, graphInsights, commentSummary, commentStrengths, commentImprovements.",
    "Each list must contain 2 to 4 concise strings. Consolidate feedback themes, do not count exact duplicates more than once, do not identify students, and remain professional and constructive.",
    JSON.stringify({
      teacher: input.teacherName,
      subject: input.subjectName,
      averageScore: input.averageScore,
      totalEvaluations: input.totalEvaluations,
      categoryAverages: input.categoryAverages,
      performanceTrend: input.trendHistory,
      trendChange: input.trendChange,
      consolidatedCommentThemes: input.commentAnalysis.themes,
      uniqueAnonymousComments: input.comments.slice(0, 30),
    }),
  ].join("\n");

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`,
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
        signal: AbortSignal.timeout(15000),
      }
    );
    if (!response.ok) return input.fallback;
    const data = await response.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return input.fallback;
    const parsed = JSON.parse(text) as Partial<ReportAnalysis> & {
      commentSummary?: string;
      commentStrengths?: string[];
      commentImprovements?: string[];
    };
    const commentAnalysis: CommentAnalysis = {
      ...input.commentAnalysis,
      summary: typeof parsed.commentSummary === "string"
        ? parsed.commentSummary
        : input.commentAnalysis.summary,
      commonStrengths: normalizeStringList(
        parsed.commentStrengths,
        input.commentAnalysis.commonStrengths
      ),
      areasForImprovement: normalizeStringList(
        parsed.commentImprovements,
        input.commentAnalysis.areasForImprovement
      ),
    };
    return {
      summary: typeof parsed.summary === "string"
        ? parsed.summary
        : input.fallback.summary,
      strengths: normalizeStringList(
        parsed.strengths,
        input.fallback.strengths
      ),
      weaknesses: normalizeStringList(
        parsed.weaknesses,
        input.fallback.weaknesses
      ),
      recommendations: normalizeStringList(
        parsed.recommendations,
        input.fallback.recommendations
      ),
      graphInsights: normalizeStringList(
        parsed.graphInsights,
        input.fallback.graphInsights
      ),
      commentAnalysis,
      aiGenerated: true,
      provider: "gemini",
    };
  } catch {
    return input.fallback;
  }
}

function normalizeStringList(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback;
  const list = value.filter(
    (item): item is string =>
      typeof item === "string" && item.trim().length > 0
  );
  return list.length > 0 ? list.slice(0, 4) : fallback;
}

function ratingLabel(averageScore: number) {
  if (averageScore >= 4.5) return "Excellent";
  if (averageScore >= 4) return "Very good";
  if (averageScore >= 3) return "Satisfactory";
  return averageScore > 0 ? "Needs support" : "No data";
}

function emptyDeliveryResult(): DeliveryResult {
  return {
    notified: 0,
    emailed: 0,
    reports: 0,
    warnings: [],
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}
