import { describe, expect, it } from "vitest";

import {
  ADMIN_MAX_PAGE_SIZE,
  parseBatchDeleteInput,
  parseCreateEventInput,
  parseAdminPhotoPresignInput,
  parsePaginationQuery,
} from "@/lib/admin/events/contracts";

describe("parseAdminPhotoPresignInput", () => {
  it("accepts image/jpeg content type", () => {
    const result = parseAdminPhotoPresignInput({ contentType: "image/jpeg" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.contentType).toBe("image/jpeg");
  });

  it("accepts image/jpeg with fileSizeBytes", () => {
    const result = parseAdminPhotoPresignInput({ contentType: "image/jpeg", fileSizeBytes: 5000 });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.fileSizeBytes).toBe(5000);
  });

  it("rejects non-jpeg content types", () => {
    expect(parseAdminPhotoPresignInput({ contentType: "image/png" }).success).toBe(false);
  });

  it("rejects empty content type", () => {
    expect(parseAdminPhotoPresignInput({ contentType: "" }).success).toBe(false);
  });

  it("rejects null payload", () => {
    expect(parseAdminPhotoPresignInput(null).success).toBe(false);
  });

  it("ignores non-finite fileSizeBytes", () => {
    const result = parseAdminPhotoPresignInput({ contentType: "image/jpeg", fileSizeBytes: NaN });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.fileSizeBytes).toBeUndefined();
  });
});

describe("parseBatchDeleteInput — extended", () => {
  it("deduplicates photoIds", () => {
    const result = parseBatchDeleteInput({ photoIds: ["p1", "p2", "p1"] });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.photoIds).toHaveLength(2);
  });

  it("filters blank strings", () => {
    const result = parseBatchDeleteInput({ photoIds: ["p1", "  ", ""] });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.photoIds).toHaveLength(1);
  });

  it(`rejects more than ${ADMIN_MAX_PAGE_SIZE} photoIds`, () => {
    const ids = Array.from({ length: ADMIN_MAX_PAGE_SIZE + 1 }, (_, i) => `p${i}`);
    const result = parseBatchDeleteInput({ photoIds: ids });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain(String(ADMIN_MAX_PAGE_SIZE));
  });

  it("rejects non-array photoIds", () => {
    expect(parseBatchDeleteInput({ photoIds: "not-an-array" }).success).toBe(false);
  });

  it("rejects empty photoIds array", () => {
    expect(parseBatchDeleteInput({ photoIds: [] }).success).toBe(false);
  });
});

describe("parseCreateEventInput — edge cases", () => {
  const valid = {
    title: "My Event",
    slug: "my-event",
    venue: "Some Venue",
    description: "A description here",
    startsAt: "2026-06-01T10:00:00.000Z",
    endsAt: "2026-06-02T10:00:00.000Z",
  };

  it("rejects end date before start date", () => {
    const result = parseCreateEventInput({
      ...valid,
      startsAt: "2026-06-02T10:00:00.000Z",
      endsAt: "2026-06-01T10:00:00.000Z",
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/end date/i);
  });

  it("rejects slug with spaces", () => {
    expect(parseCreateEventInput({ ...valid, slug: "my event" }).success).toBe(false);
  });

  it("rejects slug too short", () => {
    expect(parseCreateEventInput({ ...valid, slug: "a" }).success).toBe(false);
  });

  it("rejects title shorter than 2 characters", () => {
    expect(parseCreateEventInput({ ...valid, title: "X" }).success).toBe(false);
  });

  it("rejects description shorter than 4 characters", () => {
    expect(parseCreateEventInput({ ...valid, description: "ABC" }).success).toBe(false);
  });

  it("rejects invalid ISO dates", () => {
    expect(parseCreateEventInput({ ...valid, startsAt: "not-a-date" }).success).toBe(false);
  });

  it("trims and lowercases the slug", () => {
    const result = parseCreateEventInput({ ...valid, slug: "  My-Event  " });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.slug).toBe("my-event");
  });

  it("accepts optional logoObjectKey", () => {
    const result = parseCreateEventInput({ ...valid, logoObjectKey: "events/demo/logo.png" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.logoObjectKey).toBe("events/demo/logo.png");
  });

  it("ignores empty logoObjectKey", () => {
    const result = parseCreateEventInput({ ...valid, logoObjectKey: "  " });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.logoObjectKey).toBeUndefined();
  });

  it("rejects null payload", () => {
    expect(parseCreateEventInput(null).success).toBe(false);
  });
});

describe("parsePaginationQuery — edge cases", () => {
  it("uses defaults when values are missing", () => {
    const result = parsePaginationQuery({ page: null, pageSize: null });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.pageSize).toBeGreaterThan(0);
    }
  });

  it("caps pageSize at ADMIN_MAX_PAGE_SIZE", () => {
    const result = parsePaginationQuery({ page: "1", pageSize: "9999" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.pageSize).toBe(ADMIN_MAX_PAGE_SIZE);
  });
});
