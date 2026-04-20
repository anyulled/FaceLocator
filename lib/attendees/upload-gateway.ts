import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import {
  AWS_POC_CONSENT_TEXT_VERSION,
  buildSelfieObjectKey,
} from "@/lib/aws/boundary";
import type { UploadInstructions } from "@/lib/attendees/contracts";

export type UploadGateway = {
  createUploadInstructions(input: {
    registrationId: string;
    attendeeId: string;
    eventSlug: string;
    fileName: string;
    contentType: string;
  }): UploadInstructions | Promise<UploadInstructions>;
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

export function createUploadGatewayFromEnv(): UploadGateway {
  if (process.env.FACE_LOCATOR_AWS_UPLOAD_MODE !== "aws") {
    return mockUploadGateway;
  }

  const bucketName = process.env.FACE_LOCATOR_SELFIES_BUCKET;
  if (!bucketName) {
    return mockUploadGateway;
  }

  const s3Client = new S3Client({
    region: process.env.AWS_REGION ?? "eu-west-1",
  });

  return {
    async createUploadInstructions({
      registrationId,
      attendeeId,
      eventSlug,
      fileName,
      contentType,
    }) {
      const objectKey = buildSelfieObjectKey({
        eventId: eventSlug,
        attendeeId,
        fileName,
      });

      const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: objectKey,
        ContentType: contentType,
        Metadata: {
          "attendee-id": attendeeId,
          "consent-version": AWS_POC_CONSENT_TEXT_VERSION,
          "event-id": eventSlug,
          "registration-id": registrationId,
        },
      });

      const url = await getSignedUrl(s3Client, command, {
        expiresIn: 10 * 60,
        signableHeaders: new Set([
          "content-type",
          "x-amz-meta-attendee-id",
          "x-amz-meta-consent-version",
          "x-amz-meta-event-id",
          "x-amz-meta-registration-id",
        ]),
      });

      return {
        method: "PUT",
        url,
        headers: {
          "Content-Type": contentType,
        },
        objectKey,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      };
    },
  };
}
