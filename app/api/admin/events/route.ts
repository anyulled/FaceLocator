import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";

import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

import { parseCreateEventInput, parsePaginationQuery } from "@/lib/admin/events/contracts";
import {
  AdminReadBackendError,
  createAdminEventViaBackend,
  listAdminEventsViaBackend,
} from "@/lib/admin/events/backend";
import { isAuthorizedAdminRequest } from "@/lib/admin/auth";
import { isDatabaseErrorLike } from "@/lib/aws/database-errors";
import { buildAdminErrorResponse, extractRequestId } from "@/lib/admin/events/route-utils";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

const MAX_EVENT_LOGO_SIZE_BYTES = 1024 * 1024;
const EVENT_LOGO_TYPE_MAP: Record<string, { extension: string; contentType: string }> = {
  "image/jpeg": { extension: "jpg", contentType: "image/jpeg" },
  "image/png": { extension: "png", contentType: "image/png" },
  "image/svg+xml": { extension: "svg", contentType: "image/svg+xml" },
};
const EVENT_LOGO_EXTENSIONS = new Set(["jpg", "jpeg", "png", "svg"]);

let s3Client: S3Client | null = null;

function getEventLogosBucketName() {
  const bucket = process.env.FACE_LOCATOR_EVENT_LOGOS_BUCKET?.trim();
  if (!bucket) {
    throw new Error("FACE_LOCATOR_EVENT_LOGOS_BUCKET is required");
  }

  return bucket;
}

function getS3Client() {
  if (!s3Client) {
    s3Client = new S3Client({ region: process.env.AWS_REGION || "eu-west-1" });
  }
  return s3Client;
}

function getFileExtension(fileName: string) {
  const match = fileName.toLowerCase().trim().match(/\.([a-z0-9]+)$/);
  return match?.[1] ?? "";
}

function resolveEventLogoType(file: File) {
  const extension = getFileExtension(file.name);
  const normalizedType = file.type.toLowerCase().trim();

  if (normalizedType && EVENT_LOGO_TYPE_MAP[normalizedType]) {
    const mapped = EVENT_LOGO_TYPE_MAP[normalizedType];
    if (!extension || EVENT_LOGO_EXTENSIONS.has(extension)) {
      return mapped;
    }
  }

  if (extension === "jpg" || extension === "jpeg") {
    return EVENT_LOGO_TYPE_MAP["image/jpeg"];
  }
  if (extension === "png") {
    return EVENT_LOGO_TYPE_MAP["image/png"];
  }
  if (extension === "svg") {
    return EVENT_LOGO_TYPE_MAP["image/svg+xml"];
  }

  return null;
}

async function parseCreateEventRequest(request: NextRequest): Promise<{
  payload: unknown;
  logoFile: File | null;
}> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  const shouldTryFormData = contentType.includes("multipart/form-data") || contentType.length === 0;

  if (shouldTryFormData) {
    const formData = await request
      .clone()
      .formData()
      .catch(() => null);

    if (formData) {
      const hasEventFields =
        formData.has("title") ||
        formData.has("slug") ||
        formData.has("venue") ||
        formData.has("description") ||
        formData.has("startsAt") ||
        formData.has("endsAt") ||
        formData.has("logo");

      if (!hasEventFields) {
        return {
          payload: await request.json().catch(() => null),
          logoFile: null,
        };
      }

    const logoEntry = formData.get("logo");
    const logoFile =
      logoEntry instanceof File && logoEntry.size > 0 ? logoEntry : null;

      return {
        payload: {
          title: String(formData.get("title") ?? ""),
          slug: String(formData.get("slug") ?? ""),
          venue: String(formData.get("venue") ?? ""),
          description: String(formData.get("description") ?? ""),
          startsAt: String(formData.get("startsAt") ?? ""),
          endsAt: String(formData.get("endsAt") ?? ""),
        },
        logoFile,
      };
    }
  }

  return {
    payload: await request.json().catch(() => null),
    logoFile: null,
  };
}

async function uploadEventLogo(input: { eventSlug: string; file: File }) {
  if (input.file.size > MAX_EVENT_LOGO_SIZE_BYTES) {
    throw new Error("Logo must be 1 MB or smaller");
  }

  const logoType = resolveEventLogoType(input.file);
  if (!logoType) {
    throw new Error("Only JPG, PNG, and SVG logos are supported");
  }

  const objectKey = `events/${input.eventSlug}/logos/${randomUUID()}.${logoType.extension}`;
  const bytes = Buffer.from(await input.file.arrayBuffer());
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: getEventLogosBucketName(),
      Key: objectKey,
      Body: bytes,
      ContentType: logoType.contentType,
      Metadata: {
        "event-slug": input.eventSlug,
      },
    }),
  );

  return objectKey;
}

async function deleteEventLogoObject(objectKey: string) {
  await getS3Client().send(
    new DeleteObjectCommand({
      Bucket: getEventLogosBucketName(),
      Key: objectKey,
    }),
  );
}



export async function GET(request: NextRequest) {
  if (!(await isAuthorizedAdminRequest(request))) {
    return unauthorized();
  }

  const parsed = parsePaginationQuery({
    page: request.nextUrl.searchParams.get("page") ?? undefined,
    pageSize: request.nextUrl.searchParams.get("pageSize") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid pagination" }, { status: 400 });
  }

  try {
    const result = await listAdminEventsViaBackend(parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    return buildAdminErrorResponse({
      error,
      scope: "admin-events-api",
      requestPath: request.nextUrl.pathname,
      requestId: extractRequestId(request.headers),
      defaultMessage: "Failed to list events",
      defaultStatus: 503,
      context: { page: parsed.data.page, pageSize: parsed.data.pageSize },
    });
  }
}

export async function POST(request: NextRequest) {
  if (!(await isAuthorizedAdminRequest(request))) {
    return unauthorized();
  }

  const { payload, logoFile } = await parseCreateEventRequest(request);
  const parsed = parseCreateEventInput(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  let logoObjectKey: string | undefined;
  if (logoFile) {
    try {
      logoObjectKey = await uploadEventLogo({
        eventSlug: parsed.data.slug,
        file: logoFile,
      });
    } catch (error) {
      return NextResponse.json(
        {
          error: error instanceof Error ? error.message : "Failed to upload event logo",
        },
        { status: 400 },
      );
    }
  }

  try {
    const event = await createAdminEventViaBackend({
      ...parsed.data,
      logoObjectKey,
    });
    return NextResponse.json(event, { status: 201 });
  } catch (error) {
    if (logoObjectKey) {
      await deleteEventLogoObject(logoObjectKey).catch(() => undefined);
    }

    const requestId = extractRequestId(request.headers);
    const isDuplicate =
      (typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: string }).code === "23505") ||
      (error instanceof AdminReadBackendError && error.statusCode === 409);

    if (isDuplicate) {
      return NextResponse.json({ error: "An event with this slug already exists" }, { status: 409 });
    }

    return buildAdminErrorResponse({
      error,
      scope: "admin-events-api",
      requestPath: request.nextUrl.pathname,
      requestId,
      defaultMessage: "Failed to create event",
      defaultStatus: 500,
    });
  }
}
