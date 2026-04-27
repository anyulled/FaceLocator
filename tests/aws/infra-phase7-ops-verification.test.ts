import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const outputsTf = readFileSync(
  fileURLToPath(new URL("../../infra/outputs.tf", import.meta.url)),
  "utf8",
);
const runbook = readFileSync(
  fileURLToPath(new URL("../../runbook.sh", import.meta.url)),
  "utf8",
);
const operatorRunbook = readFileSync(
  fileURLToPath(new URL("../../docs/aws-operator-runbook.md", import.meta.url)),
  "utf8",
);
const verificationChecklist = readFileSync(
  fileURLToPath(new URL("../../docs/aws-verification-checklist.md", import.meta.url)),
  "utf8",
);
const adr = readFileSync(
  fileURLToPath(new URL("../../adr/ADR-0007-operationalize-phase6-controls.md", import.meta.url)),
  "utf8",
);

describe("infra phase 7 operational verification", () => {
  it("exposes budget outputs for operators", () => {
    expect(outputsTf).toContain('output "monthly_cost_budget_name"');
    expect(outputsTf).toContain('output "monthly_cost_budget_limit_usd"');
  });

  it("extends runbook with budget and Cognito MFA checks", () => {
    expect(runbook).toContain('terraform -chdir=infra output -raw monthly_cost_budget_name');
    expect(runbook).toContain('aws cognito-idp describe-user-pool');
    expect(runbook).toContain('Cognito MFA configuration check');
  });

  it("documents operator verification for phase 6 controls", () => {
    expect(operatorRunbook).toContain('Security and cost baseline');
    expect(operatorRunbook).toContain('monthly AWS budget alarm');
    expect(verificationChecklist).toContain('Security and cost guardrails');
    expect(verificationChecklist).toContain('monthly_cost_budget_name');
  });

  it("records phase 7 decision in ADR", () => {
    expect(adr).toContain('# ADR-0007: Operationalize Phase 6 Security Controls');
    expect(adr).toContain('Accepted');
  });
});
