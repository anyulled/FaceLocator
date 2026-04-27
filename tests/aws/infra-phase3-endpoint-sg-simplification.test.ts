import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const databaseTf = readFileSync(
  fileURLToPath(new URL("../../infra/database.tf", import.meta.url)),
  "utf8",
);
const adr = readFileSync(
  fileURLToPath(new URL("../../adr/ADR-0003-endpoint-sg-consolidation.md", import.meta.url)),
  "utf8",
);

describe("infra phase 3 endpoint SG consolidation", () => {
  it("removes dedicated private endpoint security group", () => {
    expect(databaseTf).not.toContain('resource "aws_security_group" "private_endpoints"');
  });

  it("removes interface endpoints that were only needed for VPC-attached Lambdas", () => {
    expect(databaseTf).not.toContain('resource "aws_vpc_endpoint" "secretsmanager"');
    expect(databaseTf).not.toContain('resource "aws_vpc_endpoint" "rekognition"');
    expect(databaseTf).not.toContain('resource "aws_vpc_endpoint" "ses"');
  });

  it("removes lambda runtime endpoint traffic ingress rules", () => {
    expect(databaseTf).not.toContain('resource "aws_vpc_security_group_ingress_rule" "lambda_runtime_https_from_self"');
    expect(databaseTf).not.toContain("aws_security_group.lambda_runtime.id");
  });

  it("records phase 3 decision and constraints in ADR", () => {
    expect(adr).toContain("# ADR-0003: Consolidate Interface Endpoint Security Groups");
    expect(adr).toContain("Accepted");
    expect(adr).toContain("Interface endpoints remain required");
  });
});
