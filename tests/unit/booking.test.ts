
import { describe, expect, it } from "vitest";
import { mapBookingRpcError } from "@/modules/booking/service";

describe("booking RPC error mapping", () => {
  it("maps inactive interviewer to a conflict", () => {
    const error = mapBookingRpcError({
      message: "interviewer_unavailable",
      code: "23514",
    });

    expect(error.status).toBe(409);
    expect(error.code).toBe("INTERVIEWER_UNAVAILABLE");
  });

  it("maps ineligible badge to a conflict", () => {
    const error = mapBookingRpcError({ message: "not_eligible" });

    expect(error.status).toBe(409);
    expect(error.code).toBe("NOT_ELIGIBLE");
  });

  it("maps inactive profile to forbidden", () => {
    const error = mapBookingRpcError({ message: "profile_inactive" });

    expect(error.status).toBe(403);
    expect(error.code).toBe("ACCOUNT_INACTIVE");
  });

  it("maps duplicate booking to a conflict", () => {
    const error = mapBookingRpcError({
      code: "23505",
      message: "duplicate key",
    });

    expect(error.status).toBe(409);
    expect(error.code).toBe("BOOKING_CONFLICT");
  });

  it("maps unknown errors to booking failure", () => {
    const error = mapBookingRpcError({ message: "unexpected database error" });

    expect(error.status).toBe(400);
    expect(error.code).toBe("BOOKING_FAILED");
  });


  it("maps reused idempotency keys with different payloads to a conflict", () => {
    const error = mapBookingRpcError({
      message: "idempotency_key_reused",
      code: "P0001",
    });

    expect(error.status).toBe(409);
    expect(error.code).toBe("IDEMPOTENCY_KEY_REUSED");
  });

});
