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
  `ALTER TABLE sd_accounts ADD COLUMN IF NOT EXISTS ticket_seq integer NOT NULL DEFAULT 0`,
  `CREATE TABLE IF NOT EXISTS sd_tickets (
     id serial PRIMARY KEY, account_id integer NOT NULL REFERENCES sd_accounts(id), seq integer NOT NULL,
     key text NOT NULL UNIQUE, type text NOT NULL, product_id integer REFERENCES sd_products(id),
     instance_id integer REFERENCES sd_instances(id), requester_contact_id integer REFERENCES sd_contacts(id),
     title text NOT NULL, description text NOT NULL DEFAULT '', severity text, perceived_severity text,
     priority_internal integer NOT NULL DEFAULT 3, status text NOT NULL,
     assignee_user_id integer REFERENCES users(id), channel text NOT NULL DEFAULT 'manual',
     environment text NOT NULL DEFAULT 'prod', module_area text NOT NULL DEFAULT '',
     shared_with_account boolean NOT NULL DEFAULT false, sla_applicable boolean NOT NULL DEFAULT true, rca jsonb,
     received_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
     updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, first_response_at timestamp, resolved_at timestamp,
     closed_at timestamp, CONSTRAINT sd_tickets_account_seq UNIQUE (account_id, seq))`,
  `CREATE TABLE IF NOT EXISTS sd_ticket_events (
     id bigserial PRIMARY KEY, ticket_id integer NOT NULL REFERENCES sd_tickets(id),
     at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, actor_type text NOT NULL, actor_id integer,
     kind text NOT NULL, detail jsonb NOT NULL DEFAULT '{}')`,
  `CREATE TABLE IF NOT EXISTS sd_ticket_comments (
     id serial PRIMARY KEY, ticket_id integer NOT NULL REFERENCES sd_tickets(id), visibility text NOT NULL DEFAULT 'public',
     author_type text NOT NULL, author_id integer, body text NOT NULL, created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS sd_time_entries (
     id serial PRIMARY KEY, ticket_id integer NOT NULL REFERENCES sd_tickets(id), user_id integer NOT NULL REFERENCES users(id),
     minutes integer NOT NULL, billable boolean NOT NULL DEFAULT true, work_date text NOT NULL, note text NOT NULL DEFAULT '',
     created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS sd_portal_tokens (
     id serial PRIMARY KEY, email text NOT NULL, token_hash text NOT NULL UNIQUE, expires_at timestamp NOT NULL,
     used_at timestamp, created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS sd_ticket_attachments (
     id serial PRIMARY KEY, ticket_id integer NOT NULL REFERENCES sd_tickets(id), visibility text NOT NULL DEFAULT 'public',
     filename text NOT NULL, mime text NOT NULL, size integer NOT NULL, data bytea NOT NULL,
     uploader_type text NOT NULL, uploader_id integer, created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE INDEX IF NOT EXISTS idx_sd_ticket_attachments_ticket ON sd_ticket_attachments(ticket_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sd_tickets_account_status ON sd_tickets(account_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_sd_ticket_events_ticket ON sd_ticket_events(ticket_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sd_ticket_comments_ticket ON sd_ticket_comments(ticket_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sd_time_entries_ticket ON sd_time_entries(ticket_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sd_portal_tokens_email ON sd_portal_tokens(email, created_at)`,
  `CREATE OR REPLACE FUNCTION sd_events_immutable() RETURNS trigger AS $$
     BEGIN RAISE EXCEPTION 'sd_ticket_events is append-only'; END; $$ LANGUAGE plpgsql`,
  `DROP TRIGGER IF EXISTS sd_ticket_events_no_change ON sd_ticket_events`,
  `CREATE TRIGGER sd_ticket_events_no_change BEFORE UPDATE OR DELETE ON sd_ticket_events
     FOR EACH ROW EXECUTE FUNCTION sd_events_immutable()`,
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
