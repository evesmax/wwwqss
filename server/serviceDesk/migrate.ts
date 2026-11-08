import { sql } from "drizzle-orm";
import { db } from "../db";

// Idempotent DDL for the Service Desk. drizzle-kit push is NOT used: it ignores
// tablesFilter for creation and tries to recreate existing CRM tables.
const STATEMENTS: string[] = [
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret text`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled boolean NOT NULL DEFAULT false`,
  `CREATE TABLE IF NOT EXISTS sd_products (
     id serial PRIMARY KEY, code text NOT NULL UNIQUE, name text NOT NULL,
     active boolean NOT NULL DEFAULT true, created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS sd_accounts (
     id serial PRIMARY KEY, cliente_id integer NOT NULL UNIQUE REFERENCES clientes(id),
     account_type text NOT NULL DEFAULT 'suscripcion', ticket_prefix text NOT NULL UNIQUE,
     active boolean NOT NULL DEFAULT true, created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS sd_instances (
     id serial PRIMARY KEY, account_id integer NOT NULL REFERENCES sd_accounts(id) ON DELETE CASCADE,
     product_id integer NOT NULL REFERENCES sd_products(id), name text NOT NULL,
     environment text NOT NULL DEFAULT 'prod', base_url text NOT NULL DEFAULT '',
     active boolean NOT NULL DEFAULT true)`,
  `CREATE TABLE IF NOT EXISTS sd_contracts (
     id serial PRIMARY KEY, account_id integer NOT NULL REFERENCES sd_accounts(id) ON DELETE CASCADE,
     product_id integer NOT NULL REFERENCES sd_products(id), plan text NOT NULL DEFAULT 'estandar',
     sla_active_from timestamp, calendar text NOT NULL DEFAULT 'America/Mexico_City',
     report_recipients jsonb NOT NULL DEFAULT '[]', hours_bank numeric,
     active boolean NOT NULL DEFAULT true)`,
  `CREATE TABLE IF NOT EXISTS sd_contacts (
     id serial PRIMARY KEY, account_id integer NOT NULL REFERENCES sd_accounts(id) ON DELETE CASCADE,
     email text NOT NULL, name text NOT NULL DEFAULT '', role text NOT NULL DEFAULT 'contact',
     CONSTRAINT sd_contacts_account_email UNIQUE (account_id, email))`,
  `CREATE TABLE IF NOT EXISTS sd_role_assignments (
     id serial PRIMARY KEY, user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     role text NOT NULL, scope_type text NOT NULL DEFAULT 'global', scope_id integer)`,
  `CREATE TABLE IF NOT EXISTS sd_settings (
     key text PRIMARY KEY, value jsonb NOT NULL,
     updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_by integer)`,
  `CREATE TABLE IF NOT EXISTS sd_email_log (
     id serial PRIMARY KEY, to_address text NOT NULL, subject text NOT NULL, status text NOT NULL,
     error text, created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS sd_audit_log (
     id bigserial PRIMARY KEY, at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, actor_user_id integer,
     action text NOT NULL, entity text NOT NULL, entity_id text, detail jsonb NOT NULL DEFAULT '{}')`,
  `CREATE INDEX IF NOT EXISTS idx_sd_instances_account ON sd_instances(account_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sd_contracts_account ON sd_contracts(account_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sd_contacts_account ON sd_contacts(account_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sd_role_assignments_user ON sd_role_assignments(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sd_audit_entity ON sd_audit_log(entity, entity_id)`,
  `CREATE OR REPLACE FUNCTION sd_audit_immutable() RETURNS trigger AS $$
     BEGIN RAISE EXCEPTION 'sd_audit_log is append-only'; END; $$ LANGUAGE plpgsql`,
  `DROP TRIGGER IF EXISTS sd_audit_no_change ON sd_audit_log`,
  `CREATE TRIGGER sd_audit_no_change BEFORE UPDATE OR DELETE ON sd_audit_log
     FOR EACH ROW EXECUTE FUNCTION sd_audit_immutable()`,
];

export async function ensureServiceDeskSchema() {
  for (const stmt of STATEMENTS) await db.execute(sql.raw(stmt));
}
