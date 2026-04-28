import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getFeaturedEventSlugMock } = vi.hoisted(() => ({
  getFeaturedEventSlugMock: vi.fn(async () => "demo-event-2026"),
}));

vi.mock("@/lib/events/queries", () => ({
  getFeaturedEventSlug: getFeaturedEventSlugMock,
}));

describe("home page navbar", () => {
  beforeEach(() => {
    getFeaturedEventSlugMock.mockReset();
  });

  it("includes admin and dynamic featured-event start-free link", async () => {
    getFeaturedEventSlugMock.mockResolvedValueOnce("demo-event-2026");
    const { default: HomePage } = await import("@/app/page");

    const element = await HomePage();
    const markup = renderToStaticMarkup(element);

    expect(markup).toContain('href="/admin"');
    expect(markup).toContain(">Admin<");
    expect(markup).toContain('href="/events/demo-event-2026/register"');
    expect(markup).toContain(">Start free<");
  });

  it("falls back to admin events when no featured event exists", async () => {
    getFeaturedEventSlugMock.mockResolvedValueOnce("");
    const { default: HomePage } = await import("@/app/page");

    const element = await HomePage();
    const markup = renderToStaticMarkup(element);

    expect(markup).toContain('href="/admin/events"');
    expect(markup).toContain(">Start free<");
  });
});
