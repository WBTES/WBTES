"use client";

import * as React from "react";
import { Play, Plus, X } from "lucide-react";
import { FormField, inputCls } from "@/components/data-table";
import { MAX_EVALUATIONS_PER_SESSION } from "@/lib/evaluation-queue";
import { formatSubjectLabel } from "@/lib/utils";
import type { EvaluationPeriod, Subject, Teacher, TeacherAssignment } from "@/lib/types";

export function EvaluationSelection({ assignments, teachers, subjects, periods, onStart }: {
  assignments: TeacherAssignment[];
  teachers: Record<string, Teacher>;
  subjects: Record<string, Subject>;
  periods: Record<string, EvaluationPeriod>;
  onStart: (queue: string[]) => void;
}) {
  const [teacherId, setTeacherId] = React.useState("");
  const [assignmentId, setAssignmentId] = React.useState("");
  const [selected, setSelected] = React.useState<string[]>([]);
  const eligibleIds = React.useMemo(() => new Set(assignments.map((assignment) => assignment.id)), [assignments]);
  const selection = selected.filter((id) => eligibleIds.has(id));
  const full = selection.length >= MAX_EVALUATIONS_PER_SESSION;
  const remaining = assignments.filter((assignment) => !selection.includes(assignment.id));
  const teacherIds = [...new Set(remaining.map((assignment) => assignment.teacherId))]
    .sort((a, b) => (teachers[a]?.displayName ?? "").localeCompare(teachers[b]?.displayName ?? ""));
  const teacherSubjects = remaining.filter((assignment) => assignment.teacherId === teacherId);

  React.useEffect(() => {
    if (teacherId && !assignments.some((assignment) => assignment.teacherId === teacherId && !selected.includes(assignment.id))) {
      setTeacherId("");
      setAssignmentId("");
    }
    setSelected((current) => current.some((id) => !eligibleIds.has(id)) ? current.filter((id) => eligibleIds.has(id)) : current);
  }, [assignments, eligibleIds, selected, teacherId]);

  const addSelection = () => {
    if (full || !teacherSubjects.some((assignment) => assignment.id === assignmentId)) return;
    setSelected((current) => current.includes(assignmentId) || current.length >= MAX_EVALUATIONS_PER_SESSION ? current : [...current, assignmentId]);
    setAssignmentId("");
  };

  return <section aria-label="Choose evaluations" className="mb-6 border-y border-slate-200 py-5 dark:border-slate-800">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-sm font-semibold">Pending evaluations ({assignments.length})</h2>
      <span className="text-sm tabular-nums text-slate-500 dark:text-slate-400" aria-live="polite">{selection.length} / {MAX_EVALUATIONS_PER_SESSION} selected</span>
    </div>
    <div className="grid items-end gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] [&>label]:min-w-0">
      <FormField label="Teacher/Instructor">
        <select aria-label="Teacher/Instructor" className={`${inputCls} min-w-0 max-w-full`} value={teacherId} disabled={full || !remaining.length} onChange={(event) => { setTeacherId(event.target.value); setAssignmentId(""); }}>
          <option value="">Select assigned teacher</option>
          {teacherIds.map((id) => <option key={id} value={id}>{teachers[id]?.displayName ?? "Teacher"}</option>)}
        </select>
      </FormField>
      <FormField label="Course/Subject">
        <select aria-label="Course/Subject" className={`${inputCls} min-w-0 max-w-full`} value={teacherSubjects.some((assignment) => assignment.id === assignmentId) ? assignmentId : ""} disabled={full || !teacherId} onChange={(event) => setAssignmentId(event.target.value)}>
          <option value="">Select assigned subject</option>
          {teacherSubjects.map((assignment) => <option key={assignment.id} value={assignment.id}>{subjects[assignment.subjectId] ? formatSubjectLabel(subjects[assignment.subjectId]) : "Subject"} - {periods[assignment.periodId]?.name ?? "Evaluation period"}</option>)}
        </select>
      </FormField>
      <button type="button" onClick={addSelection} disabled={full || !teacherSubjects.some((assignment) => assignment.id === assignmentId)} className="btn-secondary"><Plus className="h-4 w-4" /> Add</button>
    </div>
    {selection.length > 0 && <ul aria-label="Selected evaluations" className="mt-5 divide-y divide-slate-200 border-y border-slate-200 dark:divide-slate-800 dark:border-slate-800">
      {selection.map((id) => {
        const assignment = assignments.find((item) => item.id === id)!;
        const teacherName = teachers[assignment.teacherId]?.displayName ?? "Teacher";
        const subjectName = subjects[assignment.subjectId] ? formatSubjectLabel(subjects[assignment.subjectId]) : "Subject";
        return <li key={id} className="flex min-w-0 items-center justify-between gap-3 py-3">
          <div className="min-w-0"><p className="break-words text-sm font-semibold">{teacherName}</p><p className="mt-1 break-words text-xs text-slate-500 dark:text-slate-400">{subjectName} - {periods[assignment.periodId]?.name ?? "Evaluation period"}</p></div>
          <button type="button" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => setSelected((current) => current.filter((item) => item !== id))} aria-label={`Remove ${teacherName}, ${subjectName}`} title={`Remove ${teacherName}, ${subjectName}`}><X className="h-4 w-4" /></button>
        </li>;
      })}
    </ul>}
    <div className="mt-5 flex justify-end">
      <button type="button" onClick={() => onStart(selection)} disabled={!selection.length || selection.length > MAX_EVALUATIONS_PER_SESSION} className="btn-primary"><Play className="h-4 w-4" /> {selection.length > 1 ? `Start evaluations (${selection.length})` : "Start evaluation"}</button>
    </div>
  </section>;
}
