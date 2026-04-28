import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const variablesTf = readFileSync(
  fileURLToPath(new URL("../../infra/variables.tf", import.meta.url)),
  "utf8",
);
const databaseTf = readFileSync(
  fileURLToPath(new URL("../../infra/database.tf", import.meta.url)),
  "utf8",
);
const lambdaTf = readFileSync(
  fileURLToPath(new URL("../../infra/lambda.tf", import.meta.url)),
  "utf8",
);
const dbBoundaryDoc = readFileSync(
  fileURLToPath(new URL("../../docs/aws-database-boundary.md", import.meta.url)),
  "utf8",
);
const outputsTf = readFileSync(
  fileURLToPath(new URL("../../infra/outputs.tf", import.meta.url)),
  "utf8",
);

describe("infra option b guardrails", () => {
  it("enforces explicit cidr ingress allowlist with no /0 ranges", () => {
    expect(variablesTf).toContain("database_allowed_cidr_blocks");
    expect(variablesTf).toContain("must include at least one explicit CIDR");
    expect(variablesTf).toContain("cannot include /0 ranges");
  });

  it("keeps aurora publicly reachable behind cidr rules", () => {
    expect(databaseTf).toContain("publicly_accessible = true");
    expect(databaseTf).toContain("for_each = toset(var.database_allowed_cidr_blocks)");
  });

  it("keeps all lambdas non-vpc", () => {
    const vpcConfigBlocks = lambdaTf.match(/\n\s*vpc_config\s*\{/g) ?? [];
    expect(vpcConfigBlocks.length).toBe(0);
  });

  it("documents drift-prevention contract for option b", () => {
    expect(dbBoundaryDoc).toContain("## Drift-Prevention Contract");
    expect(dbBoundaryDoc).toContain("tests/aws/infra-option-b-guardrails.test.ts");
  });

  it("publishes option b topology outputs", () => {
    expect(outputsTf).toContain('output "lambda_network_mode"');
    expect(outputsTf).toContain('output "database_ingress_cidr_allowlist"');
  });
});
