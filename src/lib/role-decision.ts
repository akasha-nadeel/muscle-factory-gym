export type RoleDecision = {
  role: "admin" | "member";
  status: "pending" | "active";
};

export function decideRoleAndStatus(
  email: string,
  adminEmailsCsv: string | undefined,
): RoleDecision {
  const list = (adminEmailsCsv ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (list.includes(email.trim().toLowerCase())) {
    return { role: "admin", status: "active" };
  }
  return { role: "member", status: "pending" };
}
