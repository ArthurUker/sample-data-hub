-- ============================================================
-- Migration: 001_initial_schema
-- Sample Data Hub - 初始化数据库结构
-- ============================================================

-- 共享 Supabase 项目隔离：本项目所有业务对象放在独立 schema
create schema if not exists sample_data_hub;
set search_path = sample_data_hub, public;

-- 枚举类型
create type user_role as enum ('ADMIN', 'OPERATOR', 'REVIEWER', 'VIEWER');
create type sample_status as enum ('PENDING', 'IN_REVIEW', 'FINALIZED');
create type source_type as enum ('MANUAL', 'IMPORT');
create type version_action as enum ('CREATE', 'EDIT', 'IMPORT');
create type comp_status as enum ('CONSISTENT', 'DIVERGENT', 'MISSING_DATA');
create type review_conclusion as enum ('ACCEPTED', 'REJECTED');

-- ============================================================
-- 站点表
-- ============================================================
create table sample_data_hub.sites (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 用户扩展表（profiles）
-- auth.users 由 Supabase Auth 管理，profiles 存业务字段
-- ============================================================
create table sample_data_hub.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  name       text not null,
  role       user_role not null default 'VIEWER',
  site_id    uuid references sample_data_hub.sites(id),
  created_at timestamptz not null default now()
);

-- 新用户注册后自动创建 profile
create or replace function sample_data_hub.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into sample_data_hub.profiles (id, name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created_sample_data_hub
  after insert on auth.users
  for each row execute procedure sample_data_hub.handle_new_user();

-- ============================================================
-- 样本表
-- ============================================================
create table sample_data_hub.samples (
  id               text primary key,
  sample_type      text not null,
  sample_source    text,
  collection_date  date,
  submission_date  date,
  status           sample_status not null default 'PENDING',
  final_version_id uuid,  -- 后补外键，versions 创建后 alter
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ============================================================
-- 检测记录表
-- ============================================================
create table sample_data_hub.detection_records (
  id          uuid primary key default gen_random_uuid(),
  sample_id   text not null references sample_data_hub.samples(id),
  site_id     uuid not null references sample_data_hub.sites(id),
  source_type source_type not null default 'MANUAL',
  operator_id uuid not null references sample_data_hub.profiles(id),
  remark      text,
  created_at  timestamptz not null default now()
);

-- 检测项目明细表
create table sample_data_hub.detection_items (
  id           uuid primary key default gen_random_uuid(),
  record_id    uuid not null references sample_data_hub.detection_records(id) on delete cascade,
  project_name text not null,
  ct_value     numeric,
  raw_text     text,
  conclusion   text,
  is_missing   boolean not null default false,
  unit         text
);

-- ============================================================
-- 版本表（完整快照策略）
-- ============================================================
create table sample_data_hub.versions (
  id          uuid primary key default gen_random_uuid(),
  sample_id   text not null references sample_data_hub.samples(id),
  record_id   uuid not null references sample_data_hub.detection_records(id),
  version_no  integer not null,
  action_type version_action not null,
  operator_id uuid not null references sample_data_hub.profiles(id),
  note        text,
  is_latest   boolean not null default true,
  is_final    boolean not null default false,
  created_at  timestamptz not null default now()
);

create unique index versions_record_versionno_idx
  on sample_data_hub.versions(record_id, version_no);

-- 版本快照明细
create table sample_data_hub.version_snapshots (
  id           uuid primary key default gen_random_uuid(),
  version_id   uuid not null references sample_data_hub.versions(id) on delete cascade,
  project_name text not null,
  ct_value     numeric,
  raw_text     text,
  conclusion   text,
  is_missing   boolean not null default false,
  unit         text
);

-- 补充 samples 的 final_version_id 外键
alter table sample_data_hub.samples
  add constraint samples_final_version_fk
  foreign key (final_version_id) references sample_data_hub.versions(id);

-- ============================================================
-- 比对结果表
-- ============================================================
create table sample_data_hub.comparison_results (
  id            uuid primary key default gen_random_uuid(),
  sample_id     text not null references sample_data_hub.samples(id),
  project_name  text not null,
  version_ids   uuid[] not null,
  min_ct        numeric,
  max_ct        numeric,
  ct_diff       numeric,
  threshold     numeric not null,
  comp_status   comp_status not null,
  needs_review  boolean not null default false,
  calculated_at timestamptz not null default now(),
  unique (sample_id, project_name)
);

-- ============================================================
-- 审核结果表
-- ============================================================
create table sample_data_hub.reviews (
  id                   uuid primary key default gen_random_uuid(),
  sample_id            text not null references sample_data_hub.samples(id),
  reviewer_id          uuid not null references sample_data_hub.profiles(id),
  selected_version_id  uuid not null references sample_data_hub.versions(id),
  conclusion           review_conclusion not null,
  remark               text,
  is_effective         boolean not null default true,
  created_at           timestamptz not null default now()
);

-- ============================================================
-- 系统参数表
-- ============================================================
create table sample_data_hub.system_config (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

-- 初始阈值
insert into sample_data_hub.system_config (key, value) values ('ct_diff_threshold', '2');

-- ============================================================
-- 操作日志表
-- ============================================================
create table sample_data_hub.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references sample_data_hub.profiles(id),
  action      text not null,
  entity_type text not null,
  entity_id   text not null,
  detail      jsonb,
  created_at  timestamptz not null default now()
);

-- ============================================================
-- updated_at 自动更新触发器
-- ============================================================
create or replace function sample_data_hub.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger samples_updated_at
  before update on sample_data_hub.samples
  for each row execute procedure sample_data_hub.set_updated_at();

-- ============================================================
-- Row Level Security
-- ============================================================
alter table sample_data_hub.profiles enable row level security;
alter table sample_data_hub.sites enable row level security;
alter table sample_data_hub.samples enable row level security;
alter table sample_data_hub.detection_records enable row level security;
alter table sample_data_hub.detection_items enable row level security;
alter table sample_data_hub.versions enable row level security;
alter table sample_data_hub.version_snapshots enable row level security;
alter table sample_data_hub.comparison_results enable row level security;
alter table sample_data_hub.reviews enable row level security;
alter table sample_data_hub.system_config enable row level security;
alter table sample_data_hub.audit_logs enable row level security;

-- 辅助函数：获取当前用户角色
create or replace function sample_data_hub.current_user_role()
returns user_role language sql security definer stable as $$
  select role from sample_data_hub.profiles where id = auth.uid();
$$;

-- profiles：本人可读自己，ADMIN 可读所有
create policy "profiles_select_own" on sample_data_hub.profiles
  for select using (id = auth.uid() or sample_data_hub.current_user_role() = 'ADMIN');

create policy "profiles_update_own" on sample_data_hub.profiles
  for update using (id = auth.uid());

-- sites：所有登录用户可读
create policy "sites_select" on sample_data_hub.sites
  for select using (auth.uid() is not null);

create policy "sites_insert" on sample_data_hub.sites
  for insert with check (sample_data_hub.current_user_role() = 'ADMIN');

create policy "sites_update" on sample_data_hub.sites
  for update using (sample_data_hub.current_user_role() = 'ADMIN');

-- samples：所有登录用户可读；ADMIN/OPERATOR 可写
create policy "samples_select" on sample_data_hub.samples
  for select using (auth.uid() is not null);

create policy "samples_insert" on sample_data_hub.samples
  for insert with check (
    sample_data_hub.current_user_role() in ('ADMIN', 'OPERATOR')
  );

create policy "samples_update" on sample_data_hub.samples
  for update using (
    sample_data_hub.current_user_role() in ('ADMIN', 'OPERATOR', 'REVIEWER')
  );

-- detection_records：所有登录用户可读；ADMIN/OPERATOR 可写
create policy "detection_records_select" on sample_data_hub.detection_records
  for select using (auth.uid() is not null);

create policy "detection_records_insert" on sample_data_hub.detection_records
  for insert with check (
    sample_data_hub.current_user_role() in ('ADMIN', 'OPERATOR')
  );

-- detection_items：所有登录用户可读；ADMIN/OPERATOR 可写
create policy "detection_items_select" on sample_data_hub.detection_items
  for select using (auth.uid() is not null);

create policy "detection_items_insert" on sample_data_hub.detection_items
  for insert with check (
    sample_data_hub.current_user_role() in ('ADMIN', 'OPERATOR')
  );

-- versions：所有登录用户可读；ADMIN/OPERATOR 可写
create policy "versions_select" on sample_data_hub.versions
  for select using (auth.uid() is not null);

create policy "versions_insert" on sample_data_hub.versions
  for insert with check (
    sample_data_hub.current_user_role() in ('ADMIN', 'OPERATOR')
  );

create policy "versions_update" on sample_data_hub.versions
  for update using (
    sample_data_hub.current_user_role() in ('ADMIN', 'REVIEWER')
  );

-- version_snapshots：所有登录用户可读；ADMIN/OPERATOR 可写
create policy "version_snapshots_select" on sample_data_hub.version_snapshots
  for select using (auth.uid() is not null);

create policy "version_snapshots_insert" on sample_data_hub.version_snapshots
  for insert with check (
    sample_data_hub.current_user_role() in ('ADMIN', 'OPERATOR')
  );

-- comparison_results：所有登录用户可读；系统（service_role）可写
create policy "comparison_results_select" on sample_data_hub.comparison_results
  for select using (auth.uid() is not null);

-- reviews：所有登录用户可读；ADMIN/REVIEWER 可写
create policy "reviews_select" on sample_data_hub.reviews
  for select using (auth.uid() is not null);

create policy "reviews_insert" on sample_data_hub.reviews
  for insert with check (
    sample_data_hub.current_user_role() in ('ADMIN', 'REVIEWER')
  );

-- system_config：所有登录用户可读；仅 ADMIN 可写
create policy "system_config_select" on sample_data_hub.system_config
  for select using (auth.uid() is not null);

create policy "system_config_update" on sample_data_hub.system_config
  for update using (sample_data_hub.current_user_role() = 'ADMIN');

-- audit_logs：所有登录用户可读
create policy "audit_logs_select" on sample_data_hub.audit_logs
  for select using (auth.uid() is not null);

create policy "audit_logs_insert" on sample_data_hub.audit_logs
  for insert with check (auth.uid() is not null);

-- ============================================================
-- 用户名登录辅助函数：根据用户名直接获取 auth 邮箱（绕过 RLS）
-- ============================================================
create or replace function sample_data_hub.get_email_by_username(username text)
returns text
language sql
security definer
set search_path = sample_data_hub
as $$
  select u.email
  from sample_data_hub.profiles p
  join auth.users u on u.id = p.id
  where p.name = username
  limit 1;
$$;

grant execute on function sample_data_hub.get_email_by_username(text) to anon, authenticated;
grant usage on schema sample_data_hub to anon, authenticated;

-- 授予表级别访问权限（自定义 schema 需要手动 grant，不像 public schema 自动设置）
grant select, insert, update, delete on all tables in schema sample_data_hub to authenticated;
grant select on all tables in schema sample_data_hub to anon;
grant usage, select on all sequences in schema sample_data_hub to authenticated;

-- 确保未来新建的表也自动获得权限
alter default privileges in schema sample_data_hub
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema sample_data_hub
  grant select on tables to anon;
alter default privileges in schema sample_data_hub
  grant usage, select on sequences to authenticated;
