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
     id bigserial PRIMARY KEY, ticket_id integer NOT NULL REFERENCES sd_tickets(id) ON DELETE CASCADE,
     at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, actor_type text NOT NULL, actor_id integer,
     kind text NOT NULL, detail jsonb NOT NULL DEFAULT '{}')`,
  `CREATE TABLE IF NOT EXISTS sd_ticket_comments (
     id serial PRIMARY KEY, ticket_id integer NOT NULL REFERENCES sd_tickets(id) ON DELETE CASCADE, visibility text NOT NULL DEFAULT 'public',
     author_type text NOT NULL, author_id integer, body text NOT NULL, created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS sd_time_entries (
     id serial PRIMARY KEY, ticket_id integer NOT NULL REFERENCES sd_tickets(id) ON DELETE CASCADE, user_id integer NOT NULL REFERENCES users(id),
     minutes integer NOT NULL, billable boolean NOT NULL DEFAULT true, work_date text NOT NULL, note text NOT NULL DEFAULT '',
     created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS sd_portal_tokens (
     id serial PRIMARY KEY, email text NOT NULL, token_hash text NOT NULL UNIQUE, expires_at timestamp NOT NULL,
     used_at timestamp, created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS sd_ticket_attachments (
     id serial PRIMARY KEY, ticket_id integer NOT NULL REFERENCES sd_tickets(id) ON DELETE CASCADE, visibility text NOT NULL DEFAULT 'public',
     filename text NOT NULL, mime text NOT NULL, size integer NOT NULL, data bytea NOT NULL,
     uploader_type text NOT NULL, uploader_id integer, created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE INDEX IF NOT EXISTS idx_sd_ticket_attachments_ticket ON sd_ticket_attachments(ticket_id)`,
  `ALTER TABLE sd_tickets DROP CONSTRAINT IF EXISTS sd_tickets_instance_id_fkey, DROP CONSTRAINT IF EXISTS sd_tickets_requester_contact_id_fkey, DROP CONSTRAINT IF EXISTS sd_tickets_assignee_user_id_fkey`,
  `ALTER TABLE sd_tickets ADD CONSTRAINT sd_tickets_instance_id_fkey FOREIGN KEY (instance_id) REFERENCES sd_instances(id) ON DELETE SET NULL,
     ADD CONSTRAINT sd_tickets_requester_contact_id_fkey FOREIGN KEY (requester_contact_id) REFERENCES sd_contacts(id) ON DELETE SET NULL,
     ADD CONSTRAINT sd_tickets_assignee_user_id_fkey FOREIGN KEY (assignee_user_id) REFERENCES users(id) ON DELETE SET NULL`,
  `CREATE INDEX IF NOT EXISTS idx_sd_tickets_account_status ON sd_tickets(account_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_sd_ticket_events_ticket ON sd_ticket_events(ticket_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sd_ticket_comments_ticket ON sd_ticket_comments(ticket_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sd_time_entries_ticket ON sd_time_entries(ticket_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sd_portal_tokens_email ON sd_portal_tokens(email, created_at)`,
  `CREATE OR REPLACE FUNCTION sd_events_immutable() RETURNS trigger AS $$
     BEGIN
       -- Immutable while its ticket exists; a cascade from deleting the ticket (parent already gone) is allowed.
       IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM sd_tickets WHERE id = OLD.ticket_id) THEN RETURN OLD; END IF;
       RAISE EXCEPTION 'sd_ticket_events is append-only';
     END; $$ LANGUAGE plpgsql`,
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
  `ALTER TABLE sd_tickets ADD COLUMN IF NOT EXISTS sla_exclusion_reason text, ADD COLUMN IF NOT EXISTS sla_excluded_by integer`,
  `ALTER TABLE sd_tickets ADD COLUMN IF NOT EXISTS import_ref text, ADD COLUMN IF NOT EXISTS import_flags jsonb`,
  `CREATE UNIQUE INDEX IF NOT EXISTS sd_tickets_import_ref ON sd_tickets(account_id, import_ref) WHERE import_ref IS NOT NULL`,
  `ALTER TABLE sd_tickets ADD COLUMN IF NOT EXISTS context jsonb`,
  `CREATE TABLE IF NOT EXISTS sd_sdk_keys (
     id serial PRIMARY KEY, key_id text NOT NULL UNIQUE, product_id integer NOT NULL REFERENCES sd_products(id), name text NOT NULL,
     secret_enc text NOT NULL, allowed_origins jsonb NOT NULL DEFAULT '[]', active boolean NOT NULL DEFAULT true,
     created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, last_used_at timestamp)`,
  `CREATE TABLE IF NOT EXISTS sd_monitors (
     id serial PRIMARY KEY, instance_id integer NOT NULL REFERENCES sd_instances(id) ON DELETE CASCADE, name text NOT NULL, url text NOT NULL,
     expected_status integer NOT NULL DEFAULT 200, is_public boolean NOT NULL DEFAULT false, active boolean NOT NULL DEFAULT true,
     created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS sd_probe_results (
     monitor_id integer NOT NULL REFERENCES sd_monitors(id) ON DELETE CASCADE, minute timestamp NOT NULL, location text NOT NULL,
     ok boolean NOT NULL, status integer, latency_ms integer, CONSTRAINT sd_probe_results_pk UNIQUE (monitor_id, minute, location))`,
  `CREATE INDEX IF NOT EXISTS idx_sd_probe_minute ON sd_probe_results(minute)`,
  `CREATE TABLE IF NOT EXISTS sd_platform_incidents (
     id serial PRIMARY KEY, product_id integer NOT NULL REFERENCES sd_products(id), title text NOT NULL, status text NOT NULL DEFAULT 'investigating',
     impact text NOT NULL DEFAULT 'minor', is_public boolean NOT NULL DEFAULT true, auto boolean NOT NULL DEFAULT false,
     started_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, resolved_at timestamp, rca jsonb, created_by integer)`,
  `CREATE TABLE IF NOT EXISTS sd_platform_incident_updates (
     id serial PRIMARY KEY, incident_id integer NOT NULL REFERENCES sd_platform_incidents(id) ON DELETE CASCADE,
     at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, status text NOT NULL, body text NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS sd_maintenance (
     id serial PRIMARY KEY, product_id integer NOT NULL REFERENCES sd_products(id), title text NOT NULL, starts_at timestamp NOT NULL, ends_at timestamp NOT NULL,
     notice_ok boolean NOT NULL DEFAULT false, created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, created_by integer)`,
  `CREATE TABLE IF NOT EXISTS sd_reports (
     id serial PRIMARY KEY, account_id integer NOT NULL REFERENCES sd_accounts(id) ON DELETE CASCADE, period_year integer NOT NULL, period_month integer NOT NULL,
     version integer NOT NULL DEFAULT 1, status text NOT NULL DEFAULT 'draft', data jsonb NOT NULL, note text NOT NULL DEFAULT '',
     created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, created_by integer, approved_by integer, approved_at timestamp, sent_at timestamp,
     send_log jsonb NOT NULL DEFAULT '[]', CONSTRAINT sd_reports_period_version UNIQUE (account_id, period_year, period_month, version))`,
  `CREATE OR REPLACE FUNCTION sd_reports_snapshot_immutable() RETURNS trigger AS $$
     BEGIN IF NEW.data IS DISTINCT FROM OLD.data THEN RAISE EXCEPTION 'sd_reports.data is an immutable snapshot (issue a new version)'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`,
  `DROP TRIGGER IF EXISTS sd_reports_no_data_change ON sd_reports`,
  `CREATE TRIGGER sd_reports_no_data_change BEFORE UPDATE ON sd_reports FOR EACH ROW EXECUTE FUNCTION sd_reports_snapshot_immutable()`,
  `CREATE TABLE IF NOT EXISTS sd_sla_policies (
     id serial PRIMARY KEY, name text NOT NULL, position integer NOT NULL DEFAULT 100, filters jsonb NOT NULL DEFAULT '{}',
     calendar_kind text NOT NULL DEFAULT 'business', first_response_min integer, update_min integer, resolution_min integer,
     active boolean NOT NULL DEFAULT true, version integer NOT NULL DEFAULT 1, updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS sd_holidays (
     id serial PRIMARY KEY, account_id integer REFERENCES sd_accounts(id) ON DELETE CASCADE, date text NOT NULL, name text NOT NULL DEFAULT '')`,
  `CREATE UNIQUE INDEX IF NOT EXISTS sd_holidays_unique ON sd_holidays(COALESCE(account_id, 0), date)`,
  `CREATE TABLE IF NOT EXISTS sd_sla_instances (
     ticket_id integer NOT NULL REFERENCES sd_tickets(id) ON DELETE CASCADE, metric text NOT NULL, policy_id integer, policy_version integer,
     state text NOT NULL, target_ms numeric NOT NULL, elapsed_ms numeric NOT NULL, due_at timestamp, paused boolean NOT NULL DEFAULT false,
     stopped_at timestamp, breaches integer NOT NULL DEFAULT 0, pauses jsonb NOT NULL DEFAULT '[]', calc_version integer NOT NULL DEFAULT 1,
     computed_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT sd_sla_instances_pk UNIQUE (ticket_id, metric))`,
  `CREATE INDEX IF NOT EXISTS idx_sd_sla_instances_state ON sd_sla_instances(state)`,
  `CREATE TABLE IF NOT EXISTS sd_sla_alerts (
     ticket_id integer NOT NULL REFERENCES sd_tickets(id) ON DELETE CASCADE, metric text NOT NULL, threshold integer NOT NULL,
     sent_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT sd_sla_alerts_pk UNIQUE (ticket_id, metric, threshold))`,
  `CREATE TABLE IF NOT EXISTS sd_sla_changes (
     id serial PRIMARY KEY, at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, user_id integer, kind text NOT NULL, detail jsonb NOT NULL DEFAULT '{}')`,
  `INSERT INTO sd_sla_policies (name, position, filters, first_response_min, update_min, resolution_min)
     SELECT * FROM (VALUES
       ('Incidente P0', 10, '{"types":["incident"],"severities":["P0"]}'::jsonb, 120, 120, 360),
       ('Incidente P1', 20, '{"types":["incident"],"severities":["P1"]}'::jsonb, 240, 240, 480),
       ('Incidente P2', 30, '{"types":["incident"],"severities":["P2"]}'::jsonb, 720, NULL::int, 1440),
       ('Incidente P3', 40, '{"types":["incident"],"severities":["P3"]}'::jsonb, 960, NULL::int, 2160),
       ('Solicitudes y preguntas', 50, '{"types":["service_request","question"]}'::jsonb, 960, NULL::int, 2160)
     ) v(name, position, filters, first_response_min, update_min, resolution_min)
     WHERE NOT EXISTS (SELECT 1 FROM sd_sla_policies) AND NOT EXISTS (SELECT 1 FROM sd_settings WHERE key = 'sla.seeded')`,
  `INSERT INTO sd_settings (key, value) VALUES ('sla.seeded', 'true'::jsonb) ON CONFLICT (key) DO NOTHING`,
];

export async function ensureServiceDeskSchema() {
  for (const stmt of STATEMENTS) await db.execute(sql.raw(stmt));
}
