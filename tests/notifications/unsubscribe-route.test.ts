import { beforeEach, describe, expect, it, vi } from "vitest";

const unsubscribeMock = vi.fn();

vi.mock("@/lib/notifications/backend", () => ({
  unsubscribeFromMatchedPhotoNotificationsViaBackend: (...args: unknown[]) =>
    unsubscribeMock(...args),
}));

import { GET } from "@/app/api/notifications/unsubscribe/route";

describe("unsubscribe route", () => {
  beforeEach(() => {
    unsubscribeMock.mockReset();
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
    unsubscribeMock.mockResolvedValue(true);

    const response = await GET(
      new Request(
        "http://localhost/api/notifications/unsubscribe?eventId=speaker-session-2026&faceId=face_abc&token=valid",
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("unsubscribed");
    expect(unsubscribeMock).toHaveBeenCalledTimes(1);
    expect(unsubscribeMock.mock.calls[0][0]).toEqual({
      eventId: "speaker-session-2026",
      faceId: "face_abc",
      token: "valid",
    });
  });
});
