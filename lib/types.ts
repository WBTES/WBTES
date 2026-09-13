// ====================================================================
// WBTE — Domain types
// ====================================================================

export type UserRole = "admin" | "student" | "hr" | "department_head";

export interface AppUser {
  uid: string;
  email: string;
  emailNormalized?: string;
  displayName: string;
  username?: string;
  usernameNormalized?: string;
  role: UserRole;
  photoURL?: string | null;
  departmentId?: string | null;
  // Student-specific
  studentNumber?: string;
  studentNumberNormalized?: string;
  programId?: string | null;
  // Legacy display value retained while existing profiles are migrated.
  course?: string;
  yearLevel?: string;
  section?: string;
  // Staff-specific
  employeeId?: string;
  // Misc
  createdAt?: number;
  updatedAt?: number;
  lastLoginAt?: number;
  emailVerified?: boolean;
  status?: "pending" | "active" | "disabled";
}

export interface StudentRegistry {
  id: string;
  email: string;
  emailNormalized: string;
  displayName: string;
  studentNumber?: string;
  studentNumberNormalized?: string;
  programId: string;
  departmentId: string;
  course: string;
  yearLevel: string;
  section: string;
  status: "pending" | "active" | "disabled";
  claimedUid?: string | null;
  createdAt: number;
  updatedAt?: number;
}

export interface Teacher {
  id: string;
  displayName: string;
  email?: string;
  employeeId?: string;
  departmentId: string;
  subjectIds?: string[];
  programIds?: string[];
  yearLevels?: string[];
  sections?: string[];
  photoURL?: string | null;
  status?: "active" | "inactive";
  createdAt: number;
  updatedAt?: number;
}

export interface Department {
  id: string;
  name: string;
  code: string;
  createdAt: number;
}

export interface Program {
  id: string;
  name: string;
  code: string;
  departmentId: string;
  status: "active" | "inactive";
  createdAt: number;
  updatedAt?: number;
}

export interface Subject {
  id: string;
  name: string;
  code: string;
  departmentId: string;
  createdAt: number;
}

export type QuestionType = "rating" | "multiple_choice" | "text";

export interface QuestionOption {
  id: string;
  label: string;
  value: number; // weight for analytics
}

export interface EvaluationQuestion {
  id: string;
  type: QuestionType;
  text: string;
  options?: QuestionOption[]; // for multiple_choice
  scopeType?: "all" | "programs";
  programIds?: string[];
  required: boolean;
  category?: string;
  scaleMin?: number;
  scaleMax?: number;
  scaleMinLabel?: string;
  scaleMaxLabel?: string;
  order: number;
  active: boolean;
  createdAt: number;
}

export interface EvaluationForm {
  id: string;
  name: string;
  description?: string;
  questionIds: string[];
  active: boolean;
  createdAt: number;
  updatedAt?: number;
}

export type PeriodStatus = "draft" | "scheduled" | "open" | "closed";

export interface EvaluationPeriod {
  id: string;
  name: string; // e.g. "1st Semester 2025-2026"
  semester: "1st" | "2nd" | "summer";
  academicYear: string; // e.g. "2025-2026"
  startDate: number; // ms
  endDate: number; // ms
  status: PeriodStatus;
  formId?: string | null;
  questionIds: string[];
  createdAt: number;
  updatedAt?: number;
}

export interface TeacherAssignment {
  id: string;
  teacherId: string;
  subjectId: string;
  departmentId: string;
  studentIds: string[];
  programIds?: string[];
  yearLevels?: string[];
  sections?: string[];
  periodId: string;
  createdAt: number;
}

export interface DepartmentTeacherProgress {
  teacherId: string;
  assignedTasks: number;
  submittedResponses: number;
  completionRate: number;
  releasedEvaluations: number;
  averageRating: number | null;
}

export interface DepartmentOverview {
  departmentId: string;
  teacherCount: number;
  activePeriods: number;
  assignedTasks: number;
  submittedResponses: number;
  pendingTasks: number;
  completionRate: number;
  releasedPeriods: number;
  releasedEvaluations: number;
  averageRating: number | null;
  teacherProgress: DepartmentTeacherProgress[];
}

export interface DepartmentHeadTheme {
  name: string;
  count: number;
  type: FeedbackType;
}

export interface DepartmentHeadReport {
  departmentId: string;
  departmentName: string;
  minimumResponses: number;
  selectedPeriodId: string | null;
  periods: Array<{ id: string; name: string; endDate: number }>;
  teacherCount: number;
  responseCount: number;
  averageRating: number | null;
  resultsProtected: boolean;
  categories: CategoryAverage[];
  feedback: Array<{ type: FeedbackType; label: string; count: number; weightedCount: number }>;
  themes: DepartmentHeadTheme[];
  teachers: Array<{ teacherId: string; teacherName: string; responses: number; average: number | null; protected: boolean }>;
  trends: Array<{ periodId: string; periodName: string; endDate: number; responses: number; average: number | null }>;
}

export interface RatingAnswers {
  // map of questionId -> rating (1-5) or option id or text
  [questionId: string]: number | string;
}

export interface Evaluation {
  id: string;
  teacherId: string;
  subjectId: string;
  departmentId: string;
  programId?: string | null;
  course?: string;
  yearLevel?: string;
  periodId: string;
  ratings: RatingAnswers;
  comment?: string;
  averageScore: number; // computed at write time
  anonymous: true;
}

export interface EvaluationCompletion {
  id: string;
  studentId: string;
  teacherId: string;
  subjectId: string;
  departmentId: string;
  programId?: string | null;
  course?: string;
  yearLevel?: string;
  section?: string;
  periodId: string;
  assignmentId: string;
  submittedAt: number;
  status: "completed";
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  audience: "all" | UserRole;
  pinned: boolean;
  priority?: "normal" | "important" | "urgent";
  status?: "draft" | "scheduled" | "published" | "expired";
  target?: {
    departmentId?: string | null;
    programId?: string | null;
    course?: string | null;
    yearLevel?: string | null;
    section?: string | null;
  } | null;
  publishAt?: number | null;
  actionLabel?: string | null;
  actionLink?: string | null;
  sendEmail?: boolean;
  createdBy: string;
  createdAt: number;
  updatedAt?: number;
  notifiedAt?: number | null;
  emailSentAt?: number | null;
  expiresAt?: number | null;
}

export interface Notification {
  id: string;
  userId: string;
  type: "evaluation_open" | "deadline" | "completion" | "login" | "result" | "announcement" | "system";
  title: string;
  body: string;
  link?: string;
  read: boolean;
  createdAt: number;
}

// ====================================================================
// Computed / helper types
// ====================================================================

export interface TeacherStats {
  teacherId: string;
  teacherName: string;
  departmentId?: string;
  departmentName?: string;
  totalEvaluations: number;
  averageScore: number;
  trend: number; // % change vs previous period
  rank?: number;
}

export interface CompletionStats {
  periodId: string;
  totalAssignments: number;
  completed: number;
  pending: number;
  completionRate: number;
}

export interface CommentTheme {
  name: string;
  count: number;
  sentiment: "positive" | "improvement" | "mixed";
  examples: string[];
}

export interface CommentAnalysis {
  totalComments: number;
  uniqueComments: number;
  duplicatesRemoved: number;
  themes: CommentTheme[];
  commonStrengths: string[];
  areasForImprovement: string[];
  summary: string;
}

export type FeedbackType = "positive" | "suggestion" | "improvement";

export interface WeightedFeedbackTheme {
  name: string;
  rawCount: number;
  weightedCount: number;
  examples: string[];
}

export interface WeightedFeedbackGroup {
  type: FeedbackType;
  label: string;
  rawCount: number;
  weightedCount: number;
  themes: WeightedFeedbackTheme[];
  summary: string;
}

export interface WeightedCommentAnalysis {
  weightingFactor: number;
  totalComments: number;
  groups: WeightedFeedbackGroup[];
}

export interface CategoryAverage {
  category: string;
  average: number;
  count: number;
}

export interface PerformanceTrendPoint {
  periodId: string;
  periodName: string;
  endDate: number;
  average: number;
  responses: number;
}

export interface PerformanceReport {
  id: string;
  periodId: string;
  teacherId: string;
  subjectId: string;
  departmentId: string;
  totalEvaluations: number;
  averageScore: number;
  ratingLabel: string;
  comments: string[];
  categoryAverages: CategoryAverage[];
  summary: string;
  strengths: string[];
  weaknesses?: string[];
  recommendations: string[];
  graphInsights: string[];
  trendHistory?: PerformanceTrendPoint[];
  trendChange?: number;
  commentAnalysis?: CommentAnalysis;
  weightedCommentAnalysis?: WeightedCommentAnalysis;
  programIds?: string[];
  yearLevels?: string[];
  sections?: string[];
  aiGenerated: boolean;
  analysisProvider: "gemini" | "rules";
  generatedAt: number;
}

export interface BackupMetadata {
  id: string;
  createdAt: number;
  createdBy: string;
  automatic: boolean;
  collectionCount: number;
  documentCount: number;
  status: "creating" | "ready" | "failed";
  error?: string;
}

export interface AdminNavigationStatus {
  pendingStudents: number;
  overdueEvaluations: number;
  scheduleActions: number;
  backupWarning: boolean;
  backupIssue: "missing" | "failed" | "stale" | "stuck" | null;
  updatedAt: number;
}
