import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import type {
  CategoryAverage,
  Evaluation,
  WeightedCommentAnalysis,
} from "@/lib/types";
import { fmtDateTime } from "@/lib/utils-extras";

type Meta = {
  teacher: string;
  department: string;
  period: string;
};

type EvaluationLookups = {
  teachers?: Record<string, string>;
  departments?: Record<string, string>;
  subjects?: Record<string, string>;
  periods?: Record<string, string>;
  programs?: Record<string, string>;
};

export type TeacherEvaluationReportData = {
  teacher: string;
  course: string;
  subject: string;
  department: string;
  section: string;
  period: string;
  studentsEvaluated: number;
  averageScore: number;
  ratingLabel: string;
  categoryAverages: CategoryAverage[];
  weightedCommentAnalysis: WeightedCommentAnalysis;
  strengths: string[];
  areasForDevelopment: string[];
  recommendations: string[];
  analysisSource: "Gemini AI" | "Built-in rules";
  evaluations: Evaluation[];
};

export type ReportColumn<T> = {
  header: string;
  value: (row: T) => string | number;
};

export function exportToPDF(
  evaluations: Evaluation[],
  meta: Meta,
  lookups: EvaluationLookups = {}
) {
  const columns: ReportColumn<Evaluation>[] = [
    { header: "Teacher", value: (row) => lookups.teachers?.[row.teacherId] ?? row.teacherId },
    { header: "Subject", value: (row) => lookups.subjects?.[row.subjectId] ?? row.subjectId },
    { header: "Program", value: (row) => lookups.programs?.[row.programId ?? ""] ?? row.course ?? "" },
    { header: "Year", value: (row) => row.yearLevel ?? "" },
    { header: "Score", value: (row) => row.averageScore.toFixed(2) },
    { header: "Anonymous comment", value: (row) => row.comment || "—" },
  ];
  exportRowsToPDF(
    evaluations,
    "WBTE Evaluation Report",
    [
      `Teacher: ${meta.teacher}`,
      `Department: ${meta.department}`,
      `Period: ${meta.period}`,
      `Responses: ${evaluations.length}`,
      `Average: ${average(evaluations).toFixed(2)} / 5`,
    ],
    columns,
    `WBTE-Evaluation-Report-${Date.now()}.pdf`
  );
}

export function exportToExcel(
  evaluations: Evaluation[],
  meta: Meta,
  lookups: EvaluationLookups = {}
) {
  const rows = evaluations.map((evaluation) => ({
    Teacher: lookups.teachers?.[evaluation.teacherId] ?? evaluation.teacherId,
    Subject: lookups.subjects?.[evaluation.subjectId] ?? evaluation.subjectId,
    Department: lookups.departments?.[evaluation.departmentId] ?? evaluation.departmentId,
    Program: lookups.programs?.[evaluation.programId ?? ""] ?? evaluation.course ?? "",
    YearLevel: evaluation.yearLevel ?? "",
    Period: lookups.periods?.[evaluation.periodId] ?? evaluation.periodId,
    AverageScore: evaluation.averageScore,
    AnonymousComment: evaluation.comment ?? "",
    ...evaluation.ratings,
  }));
  exportRowsToExcel(
    rows,
    "Evaluations",
    {
      Product: "WBTE",
      Generated: fmtDateTime(Date.now()),
      Teacher: meta.teacher,
      Department: meta.department,
      Period: meta.period,
      Responses: evaluations.length,
      Average: average(evaluations),
    },
    `WBTE-Evaluation-Report-${Date.now()}.xlsx`
  );
}

export function exportTeacherEvaluationReportPDF(report: TeacherEvaluationReportData) {
  const document = new jsPDF({ orientation: "portrait" });
  const pageWidth = document.internal.pageSize.getWidth();
  const bodyWidth = pageWidth - 28;
  const left = 14;
  let y = 16;

  const ensureSpace = (height: number) => {
    if (y + height <= document.internal.pageSize.getHeight() - 14) return;
    document.addPage();
    y = 16;
  };
  const heading = (title: string) => {
    ensureSpace(14);
    document.setFillColor(239, 246, 255);
    document.roundedRect(left, y, bodyWidth, 9, 2, 2, "F");
    document.setFontSize(10);
    document.setTextColor(30, 64, 175);
    document.setFont("helvetica", "bold");
    document.text(title, left + 4, y + 6);
    document.setFont("helvetica", "normal");
    document.setTextColor(15, 23, 42);
    y += 13;
  };
  const paragraph = (text: string) => {
    const lines = document.splitTextToSize(text, bodyWidth);
    ensureSpace(lines.length * 5 + 3);
    document.setFontSize(9);
    document.setTextColor(71, 85, 105);
    document.text(lines, left, y);
    y += lines.length * 5 + 4;
  };
  const list = (items: string[]) => {
    items.forEach((item) => paragraph(`- ${item}`));
  };
  const tableEnd = () => {
    const finalY = (document as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY;
    y = (finalY ?? y) + 7;
  };

  document.setFillColor(15, 23, 42);
  document.rect(0, 0, pageWidth, 31, "F");
  document.setTextColor(255, 255, 255);
  document.setFont("helvetica", "bold");
  document.setFontSize(17);
  document.text("TEACHER EVALUATION REPORT", left, 14);
  document.setFontSize(9);
  document.setTextColor(191, 219, 254);
  document.text("Web-Based Teacher Evaluation System (WBTE)", left, 21);
  document.setTextColor(254, 202, 202);
  document.text("CONFIDENTIAL HR REPORT", pageWidth - left, 14, { align: "right" });
  document.setFont("helvetica", "normal");
  document.setTextColor(15, 23, 42);
  y = 38;

  heading("TEACHER INFORMATION");
  autoTable(document, {
    startY: y,
    body: [
      ["Teacher", report.teacher, "Course / Program", report.course],
      ["Subject", report.subject, "Department", report.department],
      ["Section", report.section, "Evaluation period", report.period],
      ["Students evaluated", String(report.studentsEvaluated), "Analysis source", report.analysisSource],
    ],
    theme: "grid",
    styles: { fontSize: 8.5, cellPadding: 2.4 },
    columnStyles: {
      0: { fontStyle: "bold", fillColor: [248, 250, 252] },
      2: { fontStyle: "bold", fillColor: [248, 250, 252] },
    },
  });
  tableEnd();

  heading("OVERALL EVALUATION");
  document.setFont("helvetica", "bold");
  document.setFontSize(18);
  document.setTextColor(5, 150, 105);
  document.text(`${report.averageScore.toFixed(2)} / 5.00`, left, y);
  document.setFontSize(11);
  document.text(report.ratingLabel, left + 45, y);
  document.setFont("helvetica", "normal");
  document.setTextColor(15, 23, 42);
  y += 8;

  autoTable(document, {
    startY: y,
    head: [["Category", "Rating"]],
    body: report.categoryAverages.map((category) => [
      category.category,
      category.average.toFixed(2),
    ]),
    theme: "striped",
    styles: { fontSize: 8.5, cellPadding: 2.4 },
    headStyles: { fillColor: [37, 99, 235] },
  });
  tableEnd();

  heading("STUDENT COMMENT SUMMARY");
  const feedbackRows = report.weightedCommentAnalysis.groups.map((group) => [
    group.label,
    String(group.rawCount),
    String(group.weightedCount),
  ]);
  autoTable(document, {
    startY: y,
    head: [["Feedback type", "Raw comments", "Weighted count"]],
    body: feedbackRows,
    theme: "grid",
    styles: { fontSize: 8.5, cellPadding: 2.4 },
    headStyles: { fillColor: [15, 23, 42] },
  });
  tableEnd();
  paragraph(
    `Automatic tally: similar comments are grouped and counted using a ${(report.weightedCommentAnalysis.weightingFactor * 100).toFixed(0)}% weighting factor, rounded up.`
  );

  heading("COMMENT PERFORMANCE GRAPH");
  ensureSpace(64);
  const graphGroups = report.weightedCommentAnalysis.groups;
  const maximum = Math.max(...graphGroups.map((group) => group.rawCount), 1);
  const graphLeft = left + 48;
  const graphWidth = bodyWidth - 68;
  const colors: Array<[number, number, number]> = [
    [16, 185, 129],
    [245, 158, 11],
    [239, 68, 68],
  ];
  graphGroups.forEach((group, index) => {
    const rowY = y + index * 18;
    document.setFontSize(8);
    document.setTextColor(51, 65, 85);
    document.text(group.label, left, rowY + 4);
    const [red, green, blue] = colors[index];
    document.setFillColor(red, green, blue);
    document.roundedRect(graphLeft, rowY, graphWidth * (group.rawCount / maximum), 5, 1, 1, "F");
    document.setFillColor(203, 213, 225);
    document.roundedRect(graphLeft, rowY + 7, graphWidth * (group.weightedCount / maximum), 4, 1, 1, "F");
    document.setTextColor(15, 23, 42);
    document.text(`${group.rawCount} raw`, graphLeft + graphWidth + 3, rowY + 4);
    document.text(`${group.weightedCount} weighted`, graphLeft + graphWidth + 3, rowY + 11);
  });
  y += graphGroups.length * 18 + 5;

  report.weightedCommentAnalysis.groups.forEach((group) => {
    heading(group.label.toUpperCase());
    if (group.themes.length > 0) {
      autoTable(document, {
        startY: y,
        head: [["Common theme", "Raw", "Weighted"]],
        body: group.themes.slice(0, 8).map((theme) => [
          theme.name,
          String(theme.rawCount),
          String(theme.weightedCount),
        ]),
        theme: "striped",
        styles: { fontSize: 8, cellPadding: 2.2 },
        headStyles: { fillColor: [71, 85, 105] },
      });
      tableEnd();
    }
    paragraph(group.summary);
  });

  heading("HR RECOMMENDATION");
  document.setFont("helvetica", "bold");
  document.setFontSize(9);
  document.text("Strengths", left, y);
  document.setFont("helvetica", "normal");
  y += 5;
  list(report.strengths);
  document.setFont("helvetica", "bold");
  document.text("Areas for development", left, y);
  document.setFont("helvetica", "normal");
  y += 5;
  list(report.areasForDevelopment);
  document.setFont("helvetica", "bold");
  document.text("Recommended action", left, y);
  document.setFont("helvetica", "normal");
  y += 5;
  list(report.recommendations);

  heading("CONFIDENTIALITY");
  paragraph(
    "Student comments are anonymous. Detailed comments and analysis are accessible only to authorized HR personnel and other users specifically authorized by the school."
  );
  paragraph(`Generated by WBTE on ${fmtDateTime(Date.now())}.`);
  document.save(`WBTE-Teacher-Evaluation-${Date.now()}.pdf`);
}

export function exportTeacherEvaluationReportExcel(report: TeacherEvaluationReportData) {
  const workbook = XLSX.utils.book_new();
  const summary = XLSX.utils.aoa_to_sheet([
    ["TEACHER EVALUATION REPORT"],
    ["Confidentiality", "CONFIDENTIAL HR REPORT"],
    ["Teacher", safeSpreadsheetText(report.teacher)],
    ["Course / Program", safeSpreadsheetText(report.course)],
    ["Subject", safeSpreadsheetText(report.subject)],
    ["Department", safeSpreadsheetText(report.department)],
    ["Section", safeSpreadsheetText(report.section)],
    ["Evaluation period", safeSpreadsheetText(report.period)],
    ["Students evaluated", report.studentsEvaluated],
    ["Overall rating", report.averageScore],
    ["Rating label", report.ratingLabel],
    ["Analysis source", report.analysisSource],
    ["Weighting factor", report.weightedCommentAnalysis.weightingFactor],
    ["Generated", fmtDateTime(Date.now())],
  ]);
  XLSX.utils.book_append_sheet(workbook, summary, "Report Summary");

  const categorySheet = XLSX.utils.json_to_sheet(
    report.categoryAverages.map((category) => ({
      Category: safeSpreadsheetText(category.category),
      Rating: category.average,
      RatingCount: category.count,
    }))
  );
  XLSX.utils.book_append_sheet(workbook, categorySheet, "Category Ratings");

  const performanceSheet = XLSX.utils.json_to_sheet(
    report.weightedCommentAnalysis.groups.map((group) => ({
      FeedbackType: group.label,
      RawComments: group.rawCount,
      WeightedCount: group.weightedCount,
      Summary: safeSpreadsheetText(group.summary),
    }))
  );
  XLSX.utils.book_append_sheet(workbook, performanceSheet, "Comment Performance");

  const themeRows = report.weightedCommentAnalysis.groups.flatMap((group) =>
    group.themes.map((theme) => ({
      FeedbackType: group.label,
      Theme: safeSpreadsheetText(theme.name),
      RawCount: theme.rawCount,
      WeightedCount: theme.weightedCount,
      Examples: safeSpreadsheetText(theme.examples.join(" | ")),
    }))
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(themeRows),
    "Comment Themes"
  );

  const recommendationRows = [
    ...report.strengths.map((item) => ({ Type: "Strength", Recommendation: safeSpreadsheetText(item) })),
    ...report.areasForDevelopment.map((item) => ({ Type: "Area for development", Recommendation: safeSpreadsheetText(item) })),
    ...report.recommendations.map((item) => ({ Type: "Recommended action", Recommendation: safeSpreadsheetText(item) })),
  ];
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(recommendationRows),
    "HR Recommendations"
  );

  const evaluationRows = report.evaluations.map((evaluation, index) => ({
    AnonymousResponse: index + 1,
    Program: safeSpreadsheetText(evaluation.course ?? ""),
    YearLevel: safeSpreadsheetText(evaluation.yearLevel ?? ""),
    AverageScore: evaluation.averageScore,
    AnonymousComment: safeSpreadsheetText(evaluation.comment ?? ""),
    ...evaluation.ratings,
  }));
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(evaluationRows),
    "Anonymous Evaluation Data"
  );
  XLSX.writeFile(workbook, `WBTE-Teacher-Evaluation-${Date.now()}.xlsx`);
}

export function exportRowsToPDF<T>(
  rows: T[],
  title: string,
  summaryLines: string[],
  columns: ReportColumn<T>[],
  filename: string
) {
  const document = new jsPDF({ orientation: columns.length > 6 ? "landscape" : "portrait" });
  document.setFontSize(18);
  document.text(title, 14, 18);
  document.setFontSize(9);
  document.setTextColor(90);
  document.text(`Generated: ${fmtDateTime(Date.now())}`, 14, 25);
  document.setFontSize(10);
  document.setTextColor(0);
  summaryLines.forEach((line, index) => {
    document.text(line, 14, 34 + index * 6);
  });
  autoTable(document, {
    startY: 40 + summaryLines.length * 6,
    head: [columns.map((column) => column.header)],
    body: rows.map((row) => columns.map((column) => String(column.value(row)))),
    styles: {
      fontSize: 7.5,
      cellPadding: 2,
      overflow: "linebreak",
    },
    headStyles: { fillColor: [37, 99, 235] },
  });
  document.save(filename);
}

export function exportRowsToExcel(
  rows: Array<Record<string, unknown>>,
  sheetName: string,
  summary: Record<string, string | number>,
  filename: string
) {
  const workbook = XLSX.utils.book_new();
  const dataSheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, dataSheet, sheetName.slice(0, 31));
  const summarySheet = XLSX.utils.aoa_to_sheet(
    Object.entries(summary).map(([key, value]) => [key, value])
  );
  XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");
  XLSX.writeFile(workbook, filename);
}

function average(evaluations: Evaluation[]) {
  return evaluations.length
    ? evaluations.reduce((sum, evaluation) => sum + evaluation.averageScore, 0)
      / evaluations.length
    : 0;
}

function safeSpreadsheetText(value: string) {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}
