import { RoleGuard } from "@/components/role-guard";

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return <RoleGuard allow={["student"]}>{children}</RoleGuard>;
}
