/**
 * Regression test: attendees with a NULL consent_id must not be silently
 * excluded from notification candidates.
 *
 * Root cause: `getNotificationCandidates` in
 * lambdas/matched-photo-notifier/index.js previously used INNER JOIN consents.
 * Because `event_attendees.consent_id` is nullable (ON DELETE SET NULL), any
 * attendee whose consent record was deleted would be silently excluded,
 * producing a `candidate_not_found` 404 despite having matched photos.
 *
 * Fix: LEFT JOIN consents + JavaScript validation in processCandidate
 * with detailed logging for data integrity issues.
 *
 * Update: Consent withdrawal is no longer supported by business rules.
 * Any user in event_attendees is considered to have active consent unless
 * their registration is hard-deleted (which now cascades from consent).
 */

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);

// We import the raw source to inspect the SQL text and JS logic, deliberately
// NOT executing any Lambda operations so no AWS clients are needed.
const rawSource: string = require("node:fs").readFileSync(
  fileURLToPath(
    new URL("../../lambdas/matched-photo-notifier/index.js", import.meta.url),
  ),
  "utf8",
);

function extractCandidateQueryBlock(source: string): string {
  const fnStart = source.indexOf("async function getNotificationCandidates(");
  const fnEnd = source.indexOf("\nasync function ", fnStart + 1);
  return fnStart === -1 ? "" : source.slice(fnStart, fnEnd === -1 ? undefined : fnEnd);
}

function extractProcessCandidateBlock(source: string): string {
  const fnStart = source.indexOf("async function processCandidate(");
  const fnEnd = source.indexOf("\nasync function ", fnStart + 1);
  return fnStart === -1 ? "" : source.slice(fnStart, fnEnd === -1 ? undefined : fnEnd);
}

describe("matched-photo-notifier — Consent Handling & Data Integrity (Final Enforcement)", () => {
  const queryBlock = extractCandidateQueryBlock(rawSource);
  const processBlock = extractProcessCandidateBlock(rawSource);

  describe("SQL logic (getNotificationCandidates)", () => {
    it("uses LEFT JOIN on consents so attendees with NULL consent_id are not excluded", () => {
      expect(queryBlock).toMatch(/LEFT\s+JOIN\s+consents\s+c/i);
    });

    it("does NOT use INNER JOIN on consents", () => {
      const innerJoinPattern = /(?<!LEFT\s{0,8}|RIGHT\s{0,8}|FULL\s{0,8})JOIN\s+consents/i;
      expect(queryBlock).not.toMatch(innerJoinPattern);
    });

    it("selects consentId for JS validation", () => {
      expect(queryBlock).toMatch(/c\.id\s+AS\s+"consentId"/i);
    });

    it("includes consentId in GROUP BY", () => {
      expect(queryBlock).toMatch(/GROUP\s+BY[\s\S]+c\.id/i);
    });

    it("does NOT check withdrawn_at (logic removed as per business rules)", () => {
      expect(queryBlock).not.toMatch(/withdrawn_at/i);
    });
  });

  describe("JavaScript logic (processCandidate)", () => {
    it("logs a DATA_INTEGRITY error if consent_id is missing", () => {
      expect(processBlock).toContain("if (!candidate.consentId)");
      expect(processBlock).toContain('"DATA_INTEGRITY"');
      expect(processBlock).toContain("missing a consent record");
      expect(processBlock).toContain('outcome: "skipped_missing_consent"');
    });

    it("does NOT contain withdrawal checks", () => {
      expect(processBlock).not.toContain("consentWithdrawnAt");
      expect(processBlock).not.toContain("skipped_consent_withdrawn");
    });
  });
});
