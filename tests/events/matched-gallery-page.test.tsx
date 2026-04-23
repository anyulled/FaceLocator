import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const notFoundMock = vi.fn(() => {
  throw new Error("NOT_FOUND");
});

const getMatchedGalleryDataMock = vi.fn();

vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
}));

vi.mock("next/image", () => ({
  default: ({
    unoptimized: _unoptimized,
    alt,
    ...props
  }: React.ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean }) => {
    void _unoptimized;
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt={alt ?? ""} {...props} />;
  },
}));

vi.mock("@/lib/notifications/backend", () => ({
  getMatchedGalleryDataViaBackend: (...args: unknown[]) =>
    getMatchedGalleryDataMock(...args),
}));

describe("matched gallery page", () => {
  beforeEach(() => {
    notFoundMock.mockClear();
    getMatchedGalleryDataMock.mockReset();
  });

  it("renders only logo, attendee name, and photos for a valid token", async () => {
    getMatchedGalleryDataMock.mockResolvedValue({
      attendeeName: "Jane Doe",
      photoUrls: ["https://photos.example.test/1.jpg", "https://photos.example.test/2.jpg"],
    });

    const { default: MatchedGalleryPage } = await import(
      "@/app/events/[eventSlug]/faces/[faceId]/page"
    );

    const element = await MatchedGalleryPage({
      params: Promise.resolve({
        eventSlug: "speaker-session-2026",
        faceId: "face_abc",
      }),
      searchParams: Promise.resolve({
        token: "valid",
      }),
    });

    const markup = renderToStaticMarkup(element);
    expect(markup).toContain("Event logo");
    expect(markup).toContain("Jane Doe");
    expect(markup).toContain("https://photos.example.test/1.jpg");
    expect(markup).toContain("https://photos.example.test/2.jpg");
  });

  it("delegates invalid links to notFound", async () => {
    getMatchedGalleryDataMock.mockResolvedValue(null);

    const { default: MatchedGalleryPage } = await import(
      "@/app/events/[eventSlug]/faces/[faceId]/page"
    );

    await expect(
      MatchedGalleryPage({
        params: Promise.resolve({
          eventSlug: "speaker-session-2026",
          faceId: "face_abc",
        }),
        searchParams: Promise.resolve({
          token: "invalid",
        }),
      }),
    ).rejects.toThrow("NOT_FOUND");
  });
});
