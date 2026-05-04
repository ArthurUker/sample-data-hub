-- ============================================================
-- Migration: 003_service_role_grants
-- Ensure backend service role can access custom schema resources
-- ============================================================

set search_path = sample_data_hub, public;

-- Service role needs explicit schema/table/function privileges on custom schema.
grant usage on schema sample_data_hub to service_role;
grant select, insert, update, delete on all tables in schema sample_data_hub to service_role;
grant usage, select on all sequences in schema sample_data_hub to service_role;
grant execute on all functions in schema sample_data_hub to service_role;

-- Ensure future objects also inherit expected privileges for service role.
alter default privileges in schema sample_data_hub
  grant select, insert, update, delete on tables to service_role;

alter default privileges in schema sample_data_hub
  grant usage, select on sequences to service_role;

alter default privileges in schema sample_data_hub
  grant execute on functions to service_role;
