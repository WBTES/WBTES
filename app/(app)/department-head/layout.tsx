import { RoleGuard } from "@/components/role-guard";

export default function DepartmentHeadLayout({ children }: { children: React.ReactNode }) {
  return <RoleGuard allow={["department_head"]}>{children}</RoleGuard>;
}
