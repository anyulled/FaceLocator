import { describe, expect, it, vi } from "vitest";

import {
  REGISTRATION_STATUS_POLL_INTERVAL_MS,
  pollRegistrationStatus,
} from "@/lib/attendees/orchestrator";

vi.useFakeTimers();

describe("pollRegistrationStatus", () => {
  it("returns immediately when already in terminal state ENROLLED", async () => {
    const getStatus = vi.fn().mockResolvedValue({ status: "ENROLLED" });
    const onStatus = vi.fn();

    const resultPromise = pollRegistrationStatus(getStatus, "reg-1", onStatus);
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.status).toBe("ENROLLED");
    expect(getStatus).toHaveBeenCalledTimes(1);
    expect(onStatus).toHaveBeenCalledTimes(1);
  });

  it("returns immediately on FAILED status", async () => {
    const getStatus = vi.fn().mockResolvedValue({ status: "FAILED" });
    const onStatus = vi.fn();

    const resultPromise = pollRegistrationStatus(getStatus, "reg-1", onStatus);
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.status).toBe("FAILED");
    expect(getStatus).toHaveBeenCalledTimes(1);
  });

  it("returns immediately on CANCELLED status", async () => {
    const getStatus = vi.fn().mockResolvedValue({ status: "CANCELLED" });
    const onStatus = vi.fn();

    const resultPromise = pollRegistrationStatus(getStatus, "reg-1", onStatus);
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.status).toBe("CANCELLED");
  });

  it("polls until ENROLLED after intermediate states", async () => {
    const getStatus = vi
      .fn()
      .mockResolvedValueOnce({ status: "UPLOAD_PENDING" })
      .mockResolvedValueOnce({ status: "PROCESSING" })
      .mockResolvedValueOnce({ status: "ENROLLED" });

    const onStatus = vi.fn();

    const resultPromise = pollRegistrationStatus(getStatus, "reg-1", onStatus);

    // Advance timers to trigger the polling interval twice
    await vi.advanceTimersByTimeAsync(REGISTRATION_STATUS_POLL_INTERVAL_MS);
    await vi.advanceTimersByTimeAsync(REGISTRATION_STATUS_POLL_INTERVAL_MS);
    await vi.runAllTimersAsync();

    const result = await resultPromise;

    expect(result.status).toBe("ENROLLED");
    expect(getStatus).toHaveBeenCalledTimes(3);
    expect(onStatus).toHaveBeenCalledTimes(3);
  });

  it("invokes onStatus with each polled status", async () => {
    const statuses = [{ status: "UPLOAD_PENDING" }, { status: "FAILED" }];
    const getStatus = vi
      .fn()
      .mockResolvedValueOnce(statuses[0])
      .mockResolvedValueOnce(statuses[1]);

    const onStatus = vi.fn();
    const resultPromise = pollRegistrationStatus(getStatus, "reg-1", onStatus);

    await vi.advanceTimersByTimeAsync(REGISTRATION_STATUS_POLL_INTERVAL_MS);
    await vi.runAllTimersAsync();
    await resultPromise;

    expect(onStatus).toHaveBeenCalledWith(statuses[0]);
    expect(onStatus).toHaveBeenCalledWith(statuses[1]);
  });

  it("exports a non-zero poll interval constant", () => {
    expect(REGISTRATION_STATUS_POLL_INTERVAL_MS).toBeGreaterThan(0);
  });
});
