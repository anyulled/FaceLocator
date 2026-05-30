import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const iamTf = readFileSync(
  fileURLToPath(new URL("../../infra/iam.tf", import.meta.url)),
  "utf8",
);
const lambdaTf = readFileSync(
  fileURLToPath(new URL("../../infra/lambda.tf", import.meta.url)),
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
const readme = readFileSync(
  fileURLToPath(new URL("../../README.md", import.meta.url)),
  "utf8",
);
const operatorRunbook = readFileSync(
  fileURLToPath(new URL("../../docs/aws-operator-runbook.md", import.meta.url)),
  "utf8",
);

describe("well-formed aws architecture follow-up", () => {
  it("uses one shared scheduler role for recurring worker invokes", () => {
    expect(iamTf).toContain('resource "aws_iam_role" "worker_scheduler"');
    expect(iamTf).toContain('resource "aws_iam_role_policy" "worker_scheduler"');
    expect(iamTf).toContain("aws_lambda_function.event_photo_worker.arn");
    expect(iamTf).toContain("aws_lambda_function.matched_photo_notifier.arn");
    expect(lambdaTf).toContain("role_arn = aws_iam_role.worker_scheduler.arn");
  });

  it("defaults worker log retention to seven days", () => {
    expect(variablesTf).toContain('variable "cloudwatch_log_retention_days"');
    expect(variablesTf).toContain("default     = 7");
    expect(tfvarsExample).toContain("cloudwatch_log_retention_days = 7");
  });

  it("documents the leaner worker ops baseline", () => {
    expect(readme).toContain("Seven-day CloudWatch retention");
    expect(operatorRunbook).toContain("share one EventBridge Scheduler invoke role");
  });
});
