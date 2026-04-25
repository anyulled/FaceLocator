import { describe, it, expect } from "vitest";
import { getFileExtension, resolveEventLogoType, parseCreateEventRequest } from "@/lib/admin/events/form-utils";
import { NextRequest } from "next/server";

describe("form-utils", () => {
  describe("getFileExtension", () => {
    it("returns extension for normal files", () => {
      expect(getFileExtension("test.jpg")).toBe("jpg");
      expect(getFileExtension("TEST.PNG ")).toBe("png");
    });

    it("returns empty string for no extension", () => {
      expect(getFileExtension("test")).toBe("");
    });
  });

  describe("resolveEventLogoType", () => {
    it("resolves by content type", () => {
      const file = new File([""], "test.jpg", { type: "image/jpeg" });
      expect(resolveEventLogoType(file)).toEqual({ extension: "jpg", contentType: "image/jpeg" });
    });

    it("resolves by extension if type is unknown", () => {
      const file = new File([""], "test.png", { type: "application/octet-stream" });
      expect(resolveEventLogoType(file)).toEqual({ extension: "png", contentType: "image/png" });
    });

    it("resolves by extension explicitly", () => {
      const file = new File([""], "test.jpg", { type: "" });
      expect(resolveEventLogoType(file)).toEqual({ extension: "jpg", contentType: "image/jpeg" });
      const pngFile = new File([""], "test.png", { type: "" });
      expect(resolveEventLogoType(pngFile)).toEqual({ extension: "png", contentType: "image/png" });
      const svgFile = new File([""], "test.svg", { type: "" });
      expect(resolveEventLogoType(svgFile)).toEqual({ extension: "svg", contentType: "image/svg+xml" });
    });

    it("returns null for unknown type/extension", () => {
      const file = new File([""], "test.txt", { type: "text/plain" });
      expect(resolveEventLogoType(file)).toBeNull();
    });
  });

  describe("parseCreateEventRequest", () => {
    it("handles formData failure", async () => {
      const req = new NextRequest("http://localhost", {
        method: "POST",
        headers: { "content-type": "multipart/form-data" },
        // Invalid body for multipart
        body: "not-form-data",
      });
      const res = await parseCreateEventRequest(req);
      expect(res.logoFile).toBeNull();
    });

    it("handles JSON failure in fallback", async () => {
      const req = new NextRequest("http://localhost", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "invalid-json",
      });
      const res = await parseCreateEventRequest(req);
      expect(res.payload).toBeNull();
    });

    it("parses JSON payload", async () => {
      const req = new NextRequest("http://localhost", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Test" }),
      });
      const res = await parseCreateEventRequest(req);
      expect(res.payload).toEqual({ title: "Test" });
      expect(res.logoFile).toBeNull();
    });

    it("parses FormData with logo", async () => {
      const formData = new FormData();
      formData.append("title", "Test Event");
      formData.append("logo", new File(["data"], "logo.jpg", { type: "image/jpeg" }));

      const req = new NextRequest("http://localhost", {
        method: "POST",
        // NextRequest handles boundary if body is FormData
        body: formData,
      });

      const res = await parseCreateEventRequest(req);
      expect(res.payload).toMatchObject({ title: "Test Event" });
      expect(res.logoFile).toBeInstanceOf(File);
      expect(res.logoFile?.name).toBe("logo.jpg");
    });

    it("falls back to JSON if multipart but no event fields", async () => {
        const formData = new FormData();
        formData.append("other", "field");

        const req = new NextRequest("http://localhost", {
          method: "POST",
          body: formData,
        });

        // We can't easily mock request.json() to succeed after formData fails in the same object,
        // but we can check the branch logic.
        const res = await parseCreateEventRequest(req);
        expect(res.logoFile).toBeNull();
    });
  });
});
