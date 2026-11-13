import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  assertNoPrivilegedSignupFields,
  registerStudentAccount,
} from "@backend/modules/auth/service";
import {
  enforceRateLimit,
  resetRateLimitBuckets,
} from "@backend/lib/rateLimit";

describe("public student signup security", () => {
  beforeEach(() => {
    resetRateLimitBuckets();
  });

  it("rejects payloads specifying privileged or custom roles", () => {
    for (const payload of [
      { role: "ADMIN" },
      { role: "OPERATIONS" },
      { role: "INTERVIEWER" },
      { roles: ["ADMIN"] },
      { assignedRole: "OPERATIONS" },
      { app_metadata: { role: "ADMIN" } },
      { isAdmin: true },
    ]) {
      expect(() => assertNoPrivilegedSignupFields(payload)).toThrowError();
      try {
        assertNoPrivilegedSignupFields(payload);
      } catch (err: any) {
        expect(err.status).toBe(403);
        expect(err.code).toBe("FORBIDDEN");
      }
    }
  });

  it("rejects mismatched confirmPassword via signupSchema", async () => {
    const mockDb = { auth: { signUp: vi.fn() } };
    await expect(
      registerStudentAccount(mockDb, {
        fullName: "Neha Sharma",
        email: "neha@example.com",
        password: "Password123",
        confirmPassword: "DifferentPassword123",
      })
    ).rejects.toThrowError();
    expect(mockDb.auth.signUp).not.toHaveBeenCalled();
  });

  it("registers a student and assigns STUDENT role when session is established", async () => {
    const mockDb = {
      auth: {
        signUp: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: "30000000-0000-4000-8000-000000000099",
              email: "student.new@example.com",
              identities: [{ id: "id-1" }],
            },
            session: { access_token: "token" },
          },
          error: null,
        }),
      },
      rpc: vi.fn().mockResolvedValue({ data: { role: "STUDENT" }, error: null }),
    };

    const result = await registerStudentAccount(mockDb, {
      fullName: "Neha Sharma",
      email: "  Student.New@example.com ",
      password: "Password123",
      confirmPassword: "Password123",
    });

    expect(result).toEqual({
      userId: "30000000-0000-4000-8000-000000000099",
      email: "student.new@example.com",
      fullName: "Neha Sharma",
      role: "STUDENT",
      requiresEmailVerification: false,
      sessionEstablished: true,
    });
    expect(mockDb.auth.signUp).toHaveBeenCalledWith({
      email: "student.new@example.com",
      password: "Password123",
      options: {
        data: {
          full_name: "Neha Sharma",
        },
      },
    });
    expect(mockDb.rpc).toHaveBeenCalledWith("ensure_student_profile");
  });

  it("signals requiresEmailVerification when Supabase returns no session", async () => {
    const mockDb = {
      auth: {
        signUp: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: "30000000-0000-4000-8000-000000000100",
              email: "verify@example.com",
              identities: [{ id: "id-1" }],
            },
            session: null,
          },
          error: null,
        }),
      },
      rpc: vi.fn(),
    };

    const result = await registerStudentAccount(
      mockDb,
      {
        fullName: "Verify Student",
        email: "verify@example.com",
        password: "Password123",
        confirmPassword: "Password123",
      },
      "http://localhost:3000/login"
    );

    expect(result.requiresEmailVerification).toBe(true);
    expect(result.sessionEstablished).toBe(false);
    expect(result.role).toBe("STUDENT");
    expect(mockDb.rpc).not.toHaveBeenCalled();
  });

  it("maps obfuscated empty identities or duplicate email errors to 409", async () => {
    const duplicateEmptyIdentitiesDb = {
      auth: {
        signUp: vi.fn().mockResolvedValue({
          data: {
            user: { id: "u-1", email: "dup@example.com", identities: [] },
            session: null,
          },
          error: null,
        }),
      },
    };

    await expect(
      registerStudentAccount(duplicateEmptyIdentitiesDb, {
        fullName: "Dup User",
        email: "dup@example.com",
        password: "Password123",
        confirmPassword: "Password123",
      })
    ).rejects.toMatchObject({ status: 409, code: "EMAIL_ALREADY_REGISTERED" });

    const duplicateErrorDb = {
      auth: {
        signUp: vi.fn().mockResolvedValue({
          data: { user: null, session: null },
          error: { message: "User already registered" },
        }),
      },
    };

    await expect(
      registerStudentAccount(duplicateErrorDb, {
        fullName: "Dup User",
        email: "dup@example.com",
        password: "Password123",
        confirmPassword: "Password123",
      })
    ).rejects.toMatchObject({ status: 409, code: "EMAIL_ALREADY_REGISTERED" });
  });

  it("maps weak password errors from Supabase to 422", async () => {
    const weakPwDb = {
      auth: {
        signUp: vi.fn().mockResolvedValue({
          data: { user: null, session: null },
          error: { message: "Password should contain uppercase" },
        }),
      },
    };

    await expect(
      registerStudentAccount(weakPwDb, {
        fullName: "Weak Pw",
        email: "weak@example.com",
        password: "Password123",
        confirmPassword: "Password123",
      })
    ).rejects.toMatchObject({ status: 422, code: "WEAK_PASSWORD" });
  });

  it("enforces sliding-window rate limits with 429 RATE_LIMITED", () => {
    const now = 1_700_000_000_000;
    for (let i = 0; i < 3; i += 1) {
      enforceRateLimit({ key: "signup:1.2.3.4", limit: 3, windowMs: 60_000 }, now + i * 1000);
    }

    expect(() =>
      enforceRateLimit({ key: "signup:1.2.3.4", limit: 3, windowMs: 60_000 }, now + 5000)
    ).toThrowError();

    try {
      enforceRateLimit({ key: "signup:1.2.3.4", limit: 3, windowMs: 60_000 }, now + 5000);
    } catch (err: any) {
      expect(err.status).toBe(429);
      expect(err.code).toBe("RATE_LIMITED");
    }

    // Allowed again after window expires
    enforceRateLimit({ key: "signup:1.2.3.4", limit: 3, windowMs: 60_000 }, now + 65_000);
  });
});
