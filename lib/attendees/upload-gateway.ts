import { buildSelfieObjectKey } from "@/lib/aws/boundary";
import type { UploadInstructions } from "@/lib/attendees/contracts";

export type UploadGateway = {
  createUploadInstructions(input: {
    registrationId: string;
    attendeeId: string;
    eventSlug: string;
    fileName: string;
    contentType: string;
  }): UploadInstructions;
};

export const mockUploadGateway: UploadGateway = {
  createUploadInstructions({ registrationId, attendeeId, eventSlug, fileName, contentType }) {
    return {
      method: "PUT",
      url: `mock://upload/${registrationId}`,
      headers: {
        "Content-Type": contentType,
      },
      objectKey: buildSelfieObjectKey({
        eventId: eventSlug,
        attendeeId,
        fileName,
      }),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    };
  },
};
