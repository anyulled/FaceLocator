import { beforeEach, describe, expect, it, vi } from "vitest";

const poolQueryMock = vi.fn();

vi.mock("@/lib/aws/database", () => ({
  getDatabasePool: vi.fn(async () => ({
    query: poolQueryMock,
  })),
}));

import { createSignedNotificationToken } from "@/lib/notifications/token";
import { GET } from "@/app/api/notifications/unsubscribe/route";

describe("unsubscribe route", () => {
  beforeEach(() => {
    process.env.MATCH_LINK_SIGNING_SECRET = "test-signing-secret";
    process.env.MATCH_LINK_TTL_DAYS = "30";
    poolQueryMock.mockReset();
    poolQueryMock.mockResolvedValue({ rows: [] });
  });

  it("returns 404 when token is missing", async () => {
    const response = await GET(
      new Request(
        "http://localhost/api/notifications/unsubscribe?eventId=speaker-session-2026&faceId=face_abc",
      ),
    );

    expect(response.status).toBe(404);
  });

  it("marks event attendee as unsubscribed when the token is valid", async () => {
    const token = createSignedNotificationToken({
      attendeeId: "att_123",
      eventId: "speaker-session-2026",
      faceId: "face_abc",
      action: "unsubscribe",
    });

    const response = await GET(
      new Request(
        `http://localhost/api/notifications/unsubscribe?eventId=speaker-session-2026&faceId=face_abc&token=${encodeURIComponent(
          token,
        )}`,
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("unsubscribed");
    expect(poolQueryMock).toHaveBeenCalledTimes(1);
    expect(poolQueryMock.mock.calls[0][1]).toEqual([
      "speaker-session-2026",
      "att_123",
    ]);
  });
});
