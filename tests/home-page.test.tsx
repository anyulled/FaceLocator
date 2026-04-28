import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/events/queries", () => ({
  getFeaturedEventSlug: vi.fn(async () => "demo-event-2026"),
}));

describe("home page navbar", () => {
  it("includes admin and featured-event navigation links", async () => {
    const { default: HomePage } = await import("@/app/page");

    const element = await HomePage();
    const markup = renderToStaticMarkup(element);

    expect(markup).toContain('href="/admin"');
    expect(markup).toContain(">Admin<");
    expect(markup).toContain('href="/events/demo-event-2026/register"');
    expect(markup).toContain(">Live demo<");
    expect(markup).toContain(">Start free<");
  });
});
