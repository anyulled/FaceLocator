import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { extractRequestId, resolveAdminIdentity } from "@/lib/admin/auth";
import { parseAdminPhotoPresignInput } from "@/lib/admin/events/contracts";
import {
  getAdminEventPhotosPageViaBackend,
  getAdminReadBackendMode,
} from "@/lib/admin/events/backend";
import { createAdminEventPhotoUpload } from "@/lib/admin/events/repository";
import { describeDatabaseError, isDatabaseErrorLike } from "@/lib/aws/database-errors";
import { buildEventPhotoPendingObjectKey } from "@/lib/aws/boundary";

const PHOTO_UPLOAD_TTL_SECONDS = 60 * 10;

let s3Client: S3Client | null = null;

function getS3Client() {
  if (!s3Client) {
    s3Client = new S3Client({ region: process.env.AWS_REGION || "eu-west-1" });
  }

  return s3Client;
}

function getEventPhotosBucketName() {
  const bucket = process.env.FACE_LOCATOR_EVENT_PHOTOS_BUCKET?.trim();
  if (!bucket) {
    throw new Error("FACE_LOCATOR_EVENT_PHOTOS_BUCKET is required");
  }

  return bucket;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ eventSlug: string }> },
) {
  const actor = await resolveAdminIdentity(request);
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  const parsed = parseAdminPhotoPresignInput(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { eventSlug } = await context.params;
  try {
    const upload = getAdminReadBackendMode() === "lambda"
      ? await (async () => {
        const page = await getAdminEventPhotosPageViaBackend({
          eventSlug,
          page: 1,
          pageSize: 1,
        });
        const event = page.event;
        if (!event) {
          return null;
        }

        const photoId = randomUUID();
        const objectKey = buildEventPhotoPendingObjectKey({
          eventId: event.id,
          photoId,
          extension: "jpg",
        });

        const command = new PutObjectCommand({
          Bucket: getEventPhotosBucketName(),
          Key: objectKey,
          ContentType: parsed.data.contentType,
          Metadata: {
            "event-id": event.id,
            "photo-id": photoId,
            "uploaded-by": actor.sub,
          },
        });

        const url = await getSignedUrl(getS3Client(), command, {
          expiresIn: PHOTO_UPLOAD_TTL_SECONDS,
          signableHeaders: new Set([
            "content-type",
            "x-amz-meta-event-id",
            "x-amz-meta-photo-id",
            "x-amz-meta-uploaded-by",
          ]),
        });

        return {
          event: {
            id: event.id,
            slug: event.slug,
          },
          photo: {
            photoId,
            objectKey,
            uploadedBy: actor.sub,
          },
          upload: {
            method: "PUT",
            url,
            headers: {
              "Content-Type": parsed.data.contentType,
              "x-amz-meta-event-id": event.id,
              "x-amz-meta-photo-id": photoId,
              "x-amz-meta-uploaded-by": actor.sub,
            },
            objectKey,
            expiresAt: new Date(Date.now() + PHOTO_UPLOAD_TTL_SECONDS * 1000).toISOString(),
          },
        };
      })()
      : await createAdminEventPhotoUpload({
        eventSlug,
        contentType: parsed.data.contentType,
        uploadedBy: actor.sub,
      });

    if (!upload) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    return NextResponse.json(upload);
  } catch (error) {
    const requestId = extractRequestId(request.headers) ?? null;
    const databaseError = isDatabaseErrorLike(error) ? describeDatabaseError(error) : null;
    console.error(
      JSON.stringify({
        scope: "admin-photo-presign-api",
        level: "error",
        message: "Failed to create admin photo upload contract",
        requestPath: request.nextUrl.pathname,
        requestId,
        eventSlug,
        actorSub: actor.sub,
        database: databaseError,
        error: error instanceof Error
          ? { name: error.name, message: error.message, stack: error.stack }
          : { message: String(error) },
      }),
    );
    return NextResponse.json(
      {
        error: databaseError?.message ?? "Failed to create upload contract",
        requestId,
      },
      { status: databaseError?.status ?? 500 },
    );
  }
}
