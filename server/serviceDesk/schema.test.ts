import { test } from "node:test";
import assert from "node:assert/strict";
import { getTableConfig } from "drizzle-orm/pg-core";
import * as s from "@shared/schema";

test("sd tables are prefixed and contacts unique per account+email", () => {
  const tables = [s.sdProducts, s.sdAccounts, s.sdInstances, s.sdContracts, s.sdContacts,
    s.sdRoleAssignments, s.sdSettings, s.sdEmailLog, s.sdAuditLog];
  for (const t of tables) assert.ok(getTableConfig(t).name.startsWith("sd_"));
  const uc = getTableConfig(s.sdContacts).uniqueConstraints.map((u) => u.columns.map((c) => c.name).join(","));
  assert.ok(uc.includes("account_id,email"));
});
test("users has MFA columns", () => {
  assert.ok("totpSecret" in s.users && "totpEnabled" in s.users);
});
