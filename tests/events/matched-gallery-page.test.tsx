import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const notFoundMock = vi.fn(() => {
  throw new Error("NOT_FOUND");
});

const getMatchedGalleryDataMock = vi.fn();
const verifySignedNotificationTokenMock = vi.fn();

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

vi.mock("@/lib/notifications/gallery", () => ({
  getMatchedGalleryData: (...args: unknown[]) => getMatchedGalleryDataMock(...args),
}));

vi.mock("@/lib/notifications/token", () => ({
  verifySignedNotificationToken: (...args: unknown[]) =>
    verifySignedNotificationTokenMock(...args),
}));

describe("matched gallery page", () => {
  beforeEach(() => {
    notFoundMock.mockClear();
    getMatchedGalleryDataMock.mockReset();
    verifySignedNotificationTokenMock.mockReset();
  });

  it("renders only logo, attendee name, and photos for a valid token", async () => {
    verifySignedNotificationTokenMock.mockReturnValue({
      sub: "att_123",
      eventId: "speaker-session-2026",
      faceId: "face_abc",
      action: "gallery",
      exp: Math.floor(Date.now() / 1000) + 1000,
    });
    getMatchedGalleryDataMock.mockResolvedValue({
      attendeeName: "Jane Doe",
      photoUrls: ["https://photos.example.test/1.jpg", "https://photos.example.test/2.jpg"],
    });

    const { default: MatchedGalleryPage } = await import(
      "@/app/events/[eventId]/faces/[faceId]/page"
    );

    const element = await MatchedGalleryPage({
      params: Promise.resolve({
        eventId: "speaker-session-2026",
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
    verifySignedNotificationTokenMock.mockReturnValue(null);

    const { default: MatchedGalleryPage } = await import(
      "@/app/events/[eventId]/faces/[faceId]/page"
    );

    await expect(
      MatchedGalleryPage({
        params: Promise.resolve({
          eventId: "speaker-session-2026",
          faceId: "face_abc",
        }),
        searchParams: Promise.resolve({
          token: "invalid",
        }),
      }),
    ).rejects.toThrow("NOT_FOUND");
  });
});
