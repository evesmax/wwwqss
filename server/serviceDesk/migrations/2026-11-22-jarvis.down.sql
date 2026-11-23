-- Rollback manual de la migración Jarvis QSS (solo quita lo agregado; no toca datos previos).
-- ADVERTENCIA: borra parent_id/origin/internal y la auditoría de llaves. Respaldar antes si importan.
DROP TABLE IF EXISTS sd_agent_audit;
ALTER TABLE sd_agent_keys DROP COLUMN IF EXISTS permissions, DROP COLUMN IF EXISTS all_products;
DROP INDEX IF EXISTS idx_sd_tickets_parent;
ALTER TABLE sd_tickets DROP COLUMN IF EXISTS parent_id, DROP COLUMN IF EXISTS origin;
ALTER TABLE sd_accounts DROP COLUMN IF EXISTS internal;
