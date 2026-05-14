import { describe, it, expect } from "vitest";
import { decideRoleAndStatus } from "@/lib/role-decision";

describe("decideRoleAndStatus", () => {
  it("returns admin/active when email matches ADMIN_EMAILS exactly", () => {
    expect(decideRoleAndStatus("owner@gym.lk", "owner@gym.lk")).toEqual({
      role: "admin",
      status: "active",
    });
  });

  it("matches case-insensitively", () => {
    expect(decideRoleAndStatus("Owner@Gym.LK", "owner@gym.lk")).toEqual({
      role: "admin",
      status: "active",
    });
  });

  it("matches one of multiple admin emails (comma-separated)", () => {
    expect(
      decideRoleAndStatus(
        "alice@gym.lk",
        "bob@gym.lk, alice@gym.lk, carol@gym.lk",
      ),
    ).toEqual({ role: "admin", status: "active" });
  });

  it("returns member/pending when not in admin list", () => {
    expect(decideRoleAndStatus("stranger@example.com", "owner@gym.lk")).toEqual(
      { role: "member", status: "pending" },
    );
  });

  it("returns member/pending when ADMIN_EMAILS is empty or undefined", () => {
    expect(decideRoleAndStatus("anyone@example.com", "")).toEqual({
      role: "member",
      status: "pending",
    });
    expect(decideRoleAndStatus("anyone@example.com", undefined)).toEqual({
      role: "member",
      status: "pending",
    });
  });
});
