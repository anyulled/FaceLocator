import { describe, it, expect } from "vitest";
import { 
  buildSelfieObjectKey, 
  buildEventPhotoPendingObjectKey, 
  parseSelfieObjectKey, 
  parseEventPhotoPendingObjectKey 
} from "@/lib/aws/boundary";

describe("AWS boundary helpers", () => {
  describe("buildSelfieObjectKey", () => {
    it("builds correct key", () => {
      expect(buildSelfieObjectKey({
        eventId: "event 1",
        attendeeId: "att 2",
        fileName: "selfie.jpg"
      })).toBe("events/event-1/attendees/att-2/selfie.jpg");
    });
  });

  describe("buildEventPhotoPendingObjectKey", () => {
    it("builds correct key with extension", () => {
      expect(buildEventPhotoPendingObjectKey({
        eventId: "event 1",
        photoId: "photo 1",
        extension: ".PNG"
      })).toBe("events/pending/event-1/photos/photo-1.png");
    });

    it("defaults to jpg if no extension", () => {
      expect(buildEventPhotoPendingObjectKey({
        eventId: "e1",
        photoId: "p1"
      })).toBe("events/pending/e1/photos/p1.jpg");
    });
  });

  describe("parseSelfieObjectKey", () => {
    it("parses valid key", () => {
      expect(parseSelfieObjectKey("events/e1/attendees/a1/s1.jpg")).toEqual({
        eventId: "e1",
        attendeeId: "a1",
        fileName: "s1.jpg"
      });
    });

    it("returns null for invalid key", () => {
      expect(parseSelfieObjectKey("invalid/key")).toBeNull();
    });
  });

  describe("parseEventPhotoPendingObjectKey", () => {
    it("parses valid key", () => {
      expect(parseEventPhotoPendingObjectKey("events/pending/e1/photos/p1.jpg")).toEqual({
        eventId: "e1",
        fileName: "p1.jpg"
      });
    });

    it("returns null for invalid key", () => {
      expect(parseEventPhotoPendingObjectKey("events/pending/too/many/segments")).toBeNull();
    });
  });
});
