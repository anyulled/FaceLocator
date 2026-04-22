import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ADMIN_EVENTS_SCHEMA_QUERIES,
  ensureAdminEventsSchema,
  resetAdminEventsSchemaEnsurerForTests,
} from "@/lib/admin/events/schema";

describe("admin events schema guard", () => {
  beforeEach(() => {
    resetAdminEventsSchemaEnsurerForTests();
  });

  it("runs the admin events schema queries only once per process", async () => {
    const query = vi.fn().mockResolvedValue(undefined);

    await ensureAdminEventsSchema({ query });
    await ensureAdminEventsSchema({ query });

    expect(query).toHaveBeenCalledTimes(ADMIN_EVENTS_SCHEMA_QUERIES.length);
    expect(query.mock.calls).toEqual(
      ADMIN_EVENTS_SCHEMA_QUERIES.map((statement) => [statement.text, statement.values]),
    );
  });

  it("retries the schema guard after a failed attempt", async () => {
    const query = vi.fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValue(undefined);

    await expect(ensureAdminEventsSchema({ query })).rejects.toThrow("boom");
    await expect(ensureAdminEventsSchema({ query })).resolves.toBeUndefined();

    expect(query).toHaveBeenCalledTimes(ADMIN_EVENTS_SCHEMA_QUERIES.length + 1);
  });
});
