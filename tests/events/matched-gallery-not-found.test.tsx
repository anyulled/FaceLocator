import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

describe("matched gallery not found page", () => {
  it("explains that the gallery link is unavailable", async () => {
    const { default: MatchedGalleryNotFound } = await import(
      "@/app/events/[eventSlug]/faces/[faceId]/not-found"
    );

    const markup = renderToStaticMarkup(<MatchedGalleryNotFound />);

    expect(markup).toContain("This photo link is not available.");
    expect(markup).toContain("The link may be expired, incomplete, or already invalidated.");
    expect(markup).toContain('href="/"');
  });
});
