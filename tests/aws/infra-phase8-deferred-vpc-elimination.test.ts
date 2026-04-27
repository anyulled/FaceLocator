import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const readme = readFileSync(
  fileURLToPath(new URL("../../README.md", import.meta.url)),
  "utf8",
);
const dbBoundary = readFileSync(
  fileURLToPath(new URL("../../docs/aws-database-boundary.md", import.meta.url)),
  "utf8",
);
const pocScope = readFileSync(
  fileURLToPath(new URL("../../docs/aws-poc-scope.md", import.meta.url)),
  "utf8",
);
const adr = readFileSync(
  fileURLToPath(new URL("../../adr/ADR-0008-defer-full-vpc-elimination.md", import.meta.url)),
  "utf8",
);

describe("infra phase 8 deferred vpc elimination", () => {
  it("documents deferred optimization in README", () => {
    expect(readme).toContain("## Deferred Optimization");
    expect(readme).toContain("Lambda functions must stay VPC-attached");
  });

  it("documents deferred path in database boundary doc", () => {
    expect(dbBoundary).toContain("## Deferred optimization path");
    expect(dbBoundary).toContain("Aurora Data API");
    expect(dbBoundary).toContain("Do not remove interface endpoints or Lambda VPC attachment as an isolated optimization change");
  });

  it("marks unsupported VPC removal as out of scope", () => {
    expect(pocScope).toContain("removing Lambda VPC attachment without first changing the private database access model");
  });

  it("records phase 8 decision in ADR", () => {
    expect(adr).toContain("# ADR-0008: Defer Full VPC Elimination Until Data Access Changes");
    expect(adr).toContain("Accepted");
  });
});
