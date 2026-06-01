import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const outputsTf = readFileSync(
  fileURLToPath(new URL("../../infra/outputs.tf", import.meta.url)),
  "utf8",
);
const iamTf = readFileSync(
  fileURLToPath(new URL("../../infra/iam.tf", import.meta.url)),
  "utf8",
);
const variablesTf = readFileSync(
  fileURLToPath(new URL("../../infra/variables.tf", import.meta.url)),
  "utf8",
);
const tfvarsExample = readFileSync(
  fileURLToPath(new URL("../../infra/terraform.tfvars.example", import.meta.url)),
  "utf8",
);
const runbook = readFileSync(
  fileURLToPath(new URL("../../runbook.sh", import.meta.url)),
  "utf8",
);
const iamBootstrap = readFileSync(
  fileURLToPath(new URL("../../docs/aws-iam-bootstrap.md", import.meta.url)),
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

  it("keeps worker logs on the 7-day poc retention baseline", () => {
    expect(variablesTf).toContain('default     = 7');
    expect(tfvarsExample).toContain("cloudwatch_log_retention_days = 7");
    expect(operatorRunbook).toContain("7-day retention baseline");
  });

  it("keeps operator bootstrap outside the product terraform stack", () => {
    expect(iamTf).not.toContain('data "aws_iam_user" "operator"');
    expect(iamTf).not.toContain('resource "aws_iam_user_policy_attachment" "operator_discovery"');
    expect(iamBootstrap).toContain("does not attach IAM policies to human users");
  });

  it("records phase 7 decision in ADR", () => {
    expect(adr).toContain('# ADR-0007: Operationalize Phase 6 Security Controls');
    expect(adr).toContain('Accepted');
  });
});
