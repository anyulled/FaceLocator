import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const cognitoTf = readFileSync(
  fileURLToPath(new URL("../../infra/cognito.tf", import.meta.url)),
  "utf8",
);
const budgetsTf = readFileSync(
  fileURLToPath(new URL("../../infra/budgets.tf", import.meta.url)),
  "utf8",
);
const variablesTf = readFileSync(
  fileURLToPath(new URL("../../infra/variables.tf", import.meta.url)),
  "utf8",
);
const tfvars = readFileSync(
  fileURLToPath(new URL("../../infra/terraform.tfvars", import.meta.url)),
  "utf8",
);
const tfvarsExample = readFileSync(
  fileURLToPath(new URL("../../infra/terraform.tfvars.example", import.meta.url)),
  "utf8",
);
const adminReadLambda = readFileSync(
  fileURLToPath(new URL("../../lambdas/admin-read/index.js", import.meta.url)),
  "utf8",
);
const attendeeRegistrationLambda = readFileSync(
  fileURLToPath(new URL("../../lambdas/attendee-registration/index.js", import.meta.url)),
  "utf8",
);
const selfieEnrollmentLambda = readFileSync(
  fileURLToPath(new URL("../../lambdas/selfie-enrollment/index.js", import.meta.url)),
  "utf8",
);
const eventPhotoWorkerLambda = readFileSync(
  fileURLToPath(new URL("../../lambdas/event-photo-worker/index.js", import.meta.url)),
  "utf8",
);
const matchedPhotoNotifierLambda = readFileSync(
  fileURLToPath(new URL("../../lambdas/matched-photo-notifier/index.js", import.meta.url)),
  "utf8",
);
const phase6Adr = readFileSync(
  fileURLToPath(new URL("../../adr/ADR-0006-security-hardening-and-cost-guardrail.md", import.meta.url)),
  "utf8",
);

describe("infra phase 6 security hardening", () => {
  it("enables optional MFA in Cognito admin pool", () => {
    expect(cognitoTf).toContain('mfa_configuration        = "OPTIONAL"');
  });

  it("enforces SSL validation in all DB Lambda clients", () => {
    const lambdaSources = [
      adminReadLambda,
      attendeeRegistrationLambda,
      selfieEnrollmentLambda,
      eventPhotoWorkerLambda,
      matchedPhotoNotifierLambda,
    ];

    for (const source of lambdaSources) {
      expect(source).toContain("ssl: true");
      expect(source).not.toContain("rejectUnauthorized: false");
    }
  });

  it("adds monthly AWS budget alarm resource", () => {
    expect(budgetsTf).toContain('resource "aws_budgets_budget" "monthly_cost"');
    expect(budgetsTf).toContain('notification_type          = "FORECASTED"');
    expect(budgetsTf).toContain('notification_type          = "ACTUAL"');
  });

  it("adds budget configuration variables and tfvars wiring", () => {
    expect(variablesTf).toContain('variable "enable_monthly_cost_budget_alarm"');
    expect(variablesTf).toContain('variable "monthly_cost_budget_limit_usd"');
    expect(variablesTf).toContain('variable "cost_budget_notification_email"');

    expect(tfvars).toContain("enable_monthly_cost_budget_alarm");
    expect(tfvars).toContain("monthly_cost_budget_limit_usd");
    expect(tfvars).toContain("cost_budget_notification_email");

    expect(tfvarsExample).toContain("enable_monthly_cost_budget_alarm");
    expect(tfvarsExample).toContain("monthly_cost_budget_limit_usd");
    expect(tfvarsExample).toContain("cost_budget_notification_email");
  });

  it("records phase 6 decision in ADR", () => {
    expect(phase6Adr).toContain("# ADR-0006: Security Hardening And Cost Guardrail Baseline");
    expect(phase6Adr).toContain("Accepted");
  });
});
