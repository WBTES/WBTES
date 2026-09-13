import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatRoleLabel(role: string) {
  if (role === "hr") return "HR";
  if (role === "department_head") return "Department Head";
  if (role === "admin") return "Administrator";
  if (role === "student") return "Student";
  return role.replaceAll("_", " ");
}
