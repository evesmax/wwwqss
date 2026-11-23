// Lets pure unit tests import modules that import db.ts without a real database.
// DB-backed tests run only when RUN_DB_TESTS=1 (with a real DATABASE_URL).
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
// Safety: DB-backed tests leave temp data and audit rows, so they may ONLY run against a disposable Neon branch, never main/production.
if (process.env.RUN_DB_TESTS === "1" && process.env.DB_TEST_ON_BRANCH !== "1")
  throw new Error("RUN_DB_TESTS=1 exige DB_TEST_ON_BRANCH=1 y un DATABASE_URL de una rama de pruebas de Neon (nunca la de producción).");
