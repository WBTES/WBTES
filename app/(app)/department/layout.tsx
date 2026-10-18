import { RoleGuard } from "@/components/role-guard";

export default function DeptLayout({ children }: { children: React.ReactNode }) {
  return <RoleGuard allow={["department_head", "admin"]}>{children}</RoleGuard>;
}
