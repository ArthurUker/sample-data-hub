-- ============================================================
-- Migration: 002_auth_hardening
-- Tighten username-login security boundaries
-- ============================================================

set search_path = sample_data_hub, public;

-- Do not expose username->email lookup to anonymous callers.
revoke execute on function sample_data_hub.get_email_by_username(text) from anon;

-- Enforce case-insensitive username uniqueness.
create unique index if not exists profiles_name_unique_ci_idx
  on sample_data_hub.profiles (lower(name));

-- Only ADMIN can update profile rows (including username/role/site assignment).
drop policy if exists "profiles_update_own" on sample_data_hub.profiles;

create policy "profiles_update_admin" on sample_data_hub.profiles
  for update
  using (sample_data_hub.current_user_role() = 'ADMIN')
  with check (sample_data_hub.current_user_role() = 'ADMIN');
