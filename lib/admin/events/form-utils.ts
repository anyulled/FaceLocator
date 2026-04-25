import { NextRequest } from "next/server";

export const MAX_EVENT_LOGO_SIZE_BYTES = 1024 * 1024;

export const EVENT_LOGO_TYPE_MAP: Record<string, { extension: string; contentType: string }> = {
  "image/jpeg": { extension: "jpg", contentType: "image/jpeg" },
  "image/png": { extension: "png", contentType: "image/png" },
  "image/svg+xml": { extension: "svg", contentType: "image/svg+xml" },
};

export const EVENT_LOGO_EXTENSIONS = new Set(["jpg", "jpeg", "png", "svg"]);

export function getFileExtension(fileName: string) {
  const match = fileName.toLowerCase().trim().match(/\.([a-z0-9]+)$/);
  return match?.[1] ?? "";
}

export function resolveEventLogoType(file: File) {
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

export async function parseCreateEventRequest(request: NextRequest): Promise<{
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
