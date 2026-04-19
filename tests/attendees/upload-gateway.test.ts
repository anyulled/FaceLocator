import { describe, expect, it } from "vitest";

import { mockUploadGateway } from "@/lib/attendees/upload-gateway";

describe("mock upload gateway", () => {
  it("creates deterministic upload instructions from the boundary input", async () => {
    const instructions = await mockUploadGateway.createUploadInstructions({
      registrationId: "reg_123",
      attendeeId: "att_123",
      eventSlug: "speaker-session-2026",
      fileName: "My Selfie.JPG",
      contentType: "image/jpeg",
    });

    expect(instructions).toMatchObject({
      method: "PUT",
      url: "mock://upload/reg_123",
      headers: {
        "Content-Type": "image/jpeg",
      },
      objectKey: "events/speaker-session-2026/attendees/att_123/my-selfie.jpg",
    });
    expect(Date.parse(instructions.expiresAt)).not.toBeNaN();
  });
});
