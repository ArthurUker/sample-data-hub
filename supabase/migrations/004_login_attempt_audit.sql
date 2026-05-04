-- ============================================================
-- Migration: 004_login_attempt_audit
-- Persist all login attempts (success and failure)
-- ============================================================

set search_path = sample_data_hub, public;

create table if not exists sample_data_hub.login_attempt_logs (
  id         uuid primary key default gen_random_uuid(),
  username   text not null,
  ip         text,
  success    boolean not null,
  reason     text,
  user_id    uuid references sample_data_hub.profiles(id),
  created_at timestamptz not null default now()
);

alter table sample_data_hub.login_attempt_logs enable row level security;

-- Only privileged roles can read login attempt logs through normal clients.
drop policy if exists "login_attempt_logs_select_admin_operator" on sample_data_hub.login_attempt_logs;
create policy "login_attempt_logs_select_admin_operator" on sample_data_hub.login_attempt_logs
  for select
  using (sample_data_hub.current_user_role() in ('ADMIN', 'OPERATOR'));

-- Service role writes these logs from backend; grant explicit table privileges.
grant select, insert on table sample_data_hub.login_attempt_logs to service_role;

alter default privileges in schema sample_data_hub
  grant select, insert on tables to service_role;
