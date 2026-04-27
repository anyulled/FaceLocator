import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const verificationChecklist = readFileSync(
  fileURLToPath(new URL("../../docs/aws-verification-checklist.md", import.meta.url)),
  "utf8",
);
const operatorRunbook = readFileSync(
  fileURLToPath(new URL("../../docs/aws-operator-runbook.md", import.meta.url)),
  "utf8",
);
const adr = readFileSync(
  fileURLToPath(new URL("../../adr/ADR-0009-release-gate-and-rollback-readiness.md", import.meta.url)),
  "utf8",
);

describe("infra phase 9 release gate", () => {
  it("documents release gate checks in verification checklist", () => {
    expect(verificationChecklist).toContain("## Release gate (phase 9)");
    expect(verificationChecklist).toContain("infra-phase6-security-hardening.test.ts");
    expect(verificationChecklist).toContain("infra-phase7-ops-verification.test.ts");
    expect(verificationChecklist).toContain("infra-phase8-deferred-vpc-elimination.test.ts");
  });

  it("documents rollback quick path in operator runbook", () => {
    expect(operatorRunbook).toContain("## Rollback quick path");
    expect(operatorRunbook).toContain("last known-good commit SHA");
    expect(operatorRunbook).toContain("infra/imports.tf");
  });

  it("records phase 9 decision in ADR", () => {
    expect(adr).toContain("# ADR-0009: Establish Release Gate And Rollback Readiness");
    expect(adr).toContain("Accepted");
  });
});
