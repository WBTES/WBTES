import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { isSmtpConfigured, sendSmtpEmail } from "@/lib/email/smtp";
import { getStudentEvaluationQuestions } from "@/lib/evaluation-questions";
import { apiErrorResponse, asString, optionalString } from "@/lib/server/api-response";
import { ApiError, requireRole } from "@/lib/server/require-admin";
import type {
  EvaluationPeriod,
  EvaluationQuestion,
  Program,
  TeacherAssignment,
} from "@/lib/types";

export const runtime = "nodejs";

type SubmissionBody = {
  assignmentId?: string;
  answers?: Record<string, unknown>;
  comment?: string;
};

export async function POST(request: Request) {
  try {
    const { decoded, profile } = await requireRole(request, ["student"]);
    const body = await request.json() as SubmissionBody;
    const assignmentId = asString(body.assignmentId, "Assignment", 200);
    const answers = body.answers && typeof body.answers === "object"
      ? body.answers
      : {};
    const comment = optionalString(body.comment, 3000);

    const assignmentSnapshot = await adminDb
      .collection("teacherAssignments")
      .doc(assignmentId)
      .get();
    if (!assignmentSnapshot.exists) {
      throw new ApiError(404, "This evaluation assignment was not found.");
    }
    const assignment = {
      id: assignmentSnapshot.id,
      ...(assignmentSnapshot.data() as Omit<TeacherAssignment, "id">),
    };
    validateStudentScope(decoded.uid, profile, assignment);

    const [teacher, subject, periodSnapshot, questionsSnapshot, programSnapshot] =
      await Promise.all([
        adminDb.collection("teachers").doc(assignment.teacherId).get(),
        adminDb.collection("subjects").doc(assignment.subjectId).get(),
        adminDb.collection("evaluationPeriods").doc(assignment.periodId).get(),
        adminDb.collection("evaluationQuestions").get(),
        profile.programId
          ? adminDb.collection("programs").doc(profile.programId).get()
          : Promise.resolve(null),
      ]);
    if (!teacher.exists || teacher.data()?.status === "inactive") {
      throw new ApiError(409, "This teacher is no longer available for evaluation.");
    }
    if (!subject.exists || subject.data()?.departmentId !== assignment.departmentId) {
      throw new ApiError(409, "The assignment subject is invalid.");
    }
    if (teacher.data()?.departmentId !== assignment.departmentId) {
      throw new ApiError(409, "The teacher and subject must belong to the same department.");
    }
    if (!periodSnapshot.exists) {
      throw new ApiError(404, "The evaluation period was not found.");
    }

    const period = {
      id: periodSnapshot.id,
      ...(periodSnapshot.data() as Omit<EvaluationPeriod, "id">),
    };
    const now = Date.now();
    if (
      period.status !== "open"
      || now < period.startDate
      || now >= period.endDate
    ) {
      throw new ApiError(409, "This evaluation period is not currently open.");
    }

    const allQuestions = questionsSnapshot.docs.map((question) => ({
      id: question.id,
      ...(question.data() as Omit<EvaluationQuestion, "id">),
    }));
    const questions = getStudentEvaluationQuestions(
      allQuestions,
      period,
      profile.programId
    );
    if (questions.length === 0) {
      throw new ApiError(409, "No active questions are assigned to your Program.");
    }
    const validatedAnswers = validateAnswers(questions, answers);
    const averageScore = computeServerAverage(questions, validatedAnswers);
    if (averageScore <= 0) {
      throw new ApiError(400, "Answer at least one scored evaluation question.");
    }

    const completionId = `${decoded.uid}_${assignment.id}`;
    const completionRef = adminDb
      .collection("evaluationCompletions")
      .doc(completionId);
    const legacyCompletionRef = adminDb
      .collection("evaluationCompletions")
      .doc(`${decoded.uid}_${assignment.teacherId}_${assignment.periodId}`);
    const evaluationRef = adminDb.collection("evaluations").doc();
    const program = programSnapshot?.exists
      ? (programSnapshot.data() as Omit<Program, "id">)
      : null;

    await adminDb.runTransaction(async (transaction) => {
      const [existing, legacyCompletion] = await Promise.all([
        transaction.get(completionRef),
        transaction.get(legacyCompletionRef),
      ]);
      if (
        existing.exists
        || (legacyCompletion.exists && legacyCompletion.data()?.assignmentId === assignment.id)
      ) {
        throw new ApiError(
          409,
          "You already submitted this teacher and subject evaluation."
        );
      }
      transaction.create(evaluationRef, {
        assignmentId: assignment.id,
        teacherId: assignment.teacherId,
        subjectId: assignment.subjectId,
        departmentId: assignment.departmentId,
        programId: profile.programId ?? null,
        course: program?.code ?? profile.course ?? "",
        yearLevel: profile.yearLevel ?? "",
        periodId: assignment.periodId,
        ratings: validatedAnswers,
        comment,
        averageScore,
        anonymous: true,
      });
      transaction.create(completionRef, {
        studentId: decoded.uid,
        teacherId: assignment.teacherId,
        subjectId: assignment.subjectId,
        departmentId: assignment.departmentId,
        programId: profile.programId ?? null,
        course: program?.code ?? profile.course ?? "",
        yearLevel: profile.yearLevel ?? "",
        section: profile.section ?? "",
        periodId: assignment.periodId,
        assignmentId: assignment.id,
        submittedAt: now,
        status: "completed",
      });
    });

    const teacherName = String(teacher.data()?.displayName ?? "your teacher");
    const notificationRef = adminDb
      .collection("notifications")
      .doc(`completion_${completionId}`);
    const activityRef = adminDb.collection("activityLogs").doc();
    const followUpBatch = adminDb.batch();
    followUpBatch.set(notificationRef, {
      userId: decoded.uid,
      type: "completion",
      title: "Evaluation submitted",
      body: `Your anonymous evaluation for ${teacherName} was recorded.`,
      read: false,
      createdAt: now,
      link: "/student/history",
    });
    followUpBatch.set(activityRef, {
      userId: decoded.uid,
      userEmail: profile.email,
      userRole: "student",
      action: "evaluation_completed",
      metadata: {
        assignmentId,
        teacherId: assignment.teacherId,
        periodId: assignment.periodId,
      },
      createdAt: now,
    });
    await followUpBatch.commit();

    let emailSent = false;
    if (isSmtpConfigured()) {
      try {
        await sendSmtpEmail({
          to: profile.email,
          subject: "WBTE evaluation completion confirmation",
          text: [
            `Hello ${profile.displayName},`,
            "",
            `Your anonymous evaluation for ${teacherName} was submitted successfully.`,
            `Evaluation period: ${period.name}`,
            `Submitted: ${new Date(now).toLocaleString("en-PH", { timeZone: "Asia/Manila" })}`,
            "",
            "Your ratings and comments are stored separately from your completion record.",
          ].join("\n"),
        });
        emailSent = true;
      } catch (error) {
        console.warn("Completion email delivery failed:", error);
      }
    }

    return NextResponse.json({
      ok: true,
      completionId,
      emailSent,
    });
  } catch (error) {
    return apiErrorResponse(error, "Evaluation submission failed.");
  }
}

function validateStudentScope(
  uid: string,
  profile: {
    programId?: string | null;
    departmentId?: string | null;
    yearLevel?: string;
    section?: string;
  },
  assignment: TeacherAssignment
) {
  if (!assignment.studentIds.includes(uid)) {
    throw new ApiError(403, "This evaluation is not assigned to you.");
  }
  if (!profile.programId || !profile.departmentId) {
    throw new ApiError(403, "Your student Program is not configured.");
  }
  if (profile.departmentId !== assignment.departmentId) {
    throw new ApiError(403, "This teacher is outside your academic department.");
  }
  if (
    assignment.programIds?.length
    && !assignment.programIds.includes(profile.programId)
  ) {
    throw new ApiError(403, "This evaluation is outside your Program.");
  }
  if (
    assignment.yearLevels?.length
    && !assignment.yearLevels.includes(profile.yearLevel ?? "")
  ) {
    throw new ApiError(403, "This evaluation is outside your year level.");
  }
  if (
    assignment.sections?.length
    && !assignment.sections.some(
      (section) => section.toLowerCase() === profile.section?.toLowerCase()
    )
  ) {
    throw new ApiError(403, "This evaluation is outside your section.");
  }
}

function validateAnswers(
  questions: EvaluationQuestion[],
  answers: Record<string, unknown>
) {
  const allowedIds = new Set(questions.map((question) => question.id));
  const output: Record<string, number | string> = {};
  Object.entries(answers).forEach(([questionId, value]) => {
    if (!allowedIds.has(questionId)) return;
    const question = questions.find((item) => item.id === questionId)!;
    if (question.type === "rating") {
      const numeric = Number(value);
      const minimum = question.scaleMin ?? 1;
      const maximum = question.scaleMax ?? 5;
      if (Number.isInteger(numeric) && numeric >= minimum && numeric <= maximum) {
        output[questionId] = numeric;
      }
      return;
    }
    if (question.type === "multiple_choice") {
      const optionId = typeof value === "string" ? value : "";
      if (question.options?.some((option) => option.id === optionId)) {
        output[questionId] = optionId;
      }
      return;
    }
    if (typeof value === "string") {
      output[questionId] = value.trim().slice(0, 2000);
    }
  });

  questions.forEach((question) => {
    if (
      question.required
      && (output[question.id] === undefined || output[question.id] === "")
    ) {
      throw new ApiError(400, `Please answer: ${question.text}`);
    }
  });
  return output;
}

function computeServerAverage(
  questions: EvaluationQuestion[],
  answers: Record<string, number | string>
) {
  const scores: number[] = [];
  questions.forEach((question) => {
    const value = answers[question.id];
    if (question.type === "rating" && typeof value === "number") {
      scores.push(value);
    }
    if (question.type === "multiple_choice" && typeof value === "string") {
      const option = question.options?.find((item) => item.id === value);
      if (option && Number.isFinite(option.value)) scores.push(option.value);
    }
  });
  if (scores.length === 0) return 0;
  return Number(
    (scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(4)
  );
}
