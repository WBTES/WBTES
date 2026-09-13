import { RoleGuard } from "@/components/role-guard";

export default function HrLayout({ children }: { children: React.ReactNode }) {
  return <RoleGuard allow={["hr", "admin"]}>{children}</RoleGuard>;
}
