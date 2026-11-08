// Lets pure unit tests import modules that import db.ts without a real database.
// DB-backed tests run only when RUN_DB_TESTS=1 (with a real DATABASE_URL).
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
