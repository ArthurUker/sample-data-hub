-- ============================================================
-- Migration: 001_initial_schema
-- Sample Data Hub - 初始化数据库结构
-- ============================================================

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
create table public.sites (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 用户扩展表（profiles）
-- auth.users 由 Supabase Auth 管理，profiles 存业务字段
-- ============================================================
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  name       text not null,
  role       user_role not null default 'VIEWER',
  site_id    uuid references public.sites(id),
  created_at timestamptz not null default now()
);

-- 新用户注册后自动创建 profile
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- 样本表
-- ============================================================
create table public.samples (
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
create table public.detection_records (
  id          uuid primary key default gen_random_uuid(),
  sample_id   text not null references public.samples(id),
  site_id     uuid not null references public.sites(id),
  source_type source_type not null default 'MANUAL',
  operator_id uuid not null references public.profiles(id),
  remark      text,
  created_at  timestamptz not null default now()
);

-- 检测项目明细表
create table public.detection_items (
  id           uuid primary key default gen_random_uuid(),
  record_id    uuid not null references public.detection_records(id) on delete cascade,
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
create table public.versions (
  id          uuid primary key default gen_random_uuid(),
  sample_id   text not null references public.samples(id),
  record_id   uuid not null references public.detection_records(id),
  version_no  integer not null,
  action_type version_action not null,
  operator_id uuid not null references public.profiles(id),
  note        text,
  is_latest   boolean not null default true,
  is_final    boolean not null default false,
  created_at  timestamptz not null default now()
);

create unique index versions_record_versionno_idx
  on public.versions(record_id, version_no);

-- 版本快照明细
create table public.version_snapshots (
  id           uuid primary key default gen_random_uuid(),
  version_id   uuid not null references public.versions(id) on delete cascade,
  project_name text not null,
  ct_value     numeric,
  raw_text     text,
  conclusion   text,
  is_missing   boolean not null default false,
  unit         text
);

-- 补充 samples 的 final_version_id 外键
alter table public.samples
  add constraint samples_final_version_fk
  foreign key (final_version_id) references public.versions(id);

-- ============================================================
-- 比对结果表
-- ============================================================
create table public.comparison_results (
  id            uuid primary key default gen_random_uuid(),
  sample_id     text not null references public.samples(id),
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
create table public.reviews (
  id                   uuid primary key default gen_random_uuid(),
  sample_id            text not null references public.samples(id),
  reviewer_id          uuid not null references public.profiles(id),
  selected_version_id  uuid not null references public.versions(id),
  conclusion           review_conclusion not null,
  remark               text,
  is_effective         boolean not null default true,
  created_at           timestamptz not null default now()
);

-- ============================================================
-- 系统参数表
-- ============================================================
create table public.system_config (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

-- 初始阈值
insert into public.system_config (key, value) values ('ct_diff_threshold', '2');

-- ============================================================
-- 操作日志表
-- ============================================================
create table public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id),
  action      text not null,
  entity_type text not null,
  entity_id   text not null,
  detail      jsonb,
  created_at  timestamptz not null default now()
);

-- ============================================================
-- updated_at 自动更新触发器
-- ============================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger samples_updated_at
  before update on public.samples
  for each row execute procedure public.set_updated_at();

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.profiles enable row level security;
alter table public.sites enable row level security;
alter table public.samples enable row level security;
alter table public.detection_records enable row level security;
alter table public.detection_items enable row level security;
alter table public.versions enable row level security;
alter table public.version_snapshots enable row level security;
alter table public.comparison_results enable row level security;
alter table public.reviews enable row level security;
alter table public.system_config enable row level security;
alter table public.audit_logs enable row level security;

-- 辅助函数：获取当前用户角色
create or replace function public.current_user_role()
returns user_role language sql security definer stable as $$
  select role from public.profiles where id = auth.uid();
$$;

-- profiles：本人可读自己，ADMIN 可读所有
create policy "profiles_select_own" on public.profiles
  for select using (id = auth.uid() or public.current_user_role() = 'ADMIN');

create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid());

-- sites：所有登录用户可读
create policy "sites_select" on public.sites
  for select using (auth.uid() is not null);

create policy "sites_insert" on public.sites
  for insert with check (public.current_user_role() = 'ADMIN');

create policy "sites_update" on public.sites
  for update using (public.current_user_role() = 'ADMIN');

-- samples：所有登录用户可读；ADMIN/OPERATOR 可写
create policy "samples_select" on public.samples
  for select using (auth.uid() is not null);

create policy "samples_insert" on public.samples
  for insert with check (
    public.current_user_role() in ('ADMIN', 'OPERATOR')
  );

create policy "samples_update" on public.samples
  for update using (
    public.current_user_role() in ('ADMIN', 'OPERATOR', 'REVIEWER')
  );

-- detection_records：所有登录用户可读；ADMIN/OPERATOR 可写
create policy "detection_records_select" on public.detection_records
  for select using (auth.uid() is not null);

create policy "detection_records_insert" on public.detection_records
  for insert with check (
    public.current_user_role() in ('ADMIN', 'OPERATOR')
  );

-- detection_items：所有登录用户可读；ADMIN/OPERATOR 可写
create policy "detection_items_select" on public.detection_items
  for select using (auth.uid() is not null);

create policy "detection_items_insert" on public.detection_items
  for insert with check (
    public.current_user_role() in ('ADMIN', 'OPERATOR')
  );

-- versions：所有登录用户可读；ADMIN/OPERATOR 可写
create policy "versions_select" on public.versions
  for select using (auth.uid() is not null);

create policy "versions_insert" on public.versions
  for insert with check (
    public.current_user_role() in ('ADMIN', 'OPERATOR')
  );

create policy "versions_update" on public.versions
  for update using (
    public.current_user_role() in ('ADMIN', 'REVIEWER')
  );

-- version_snapshots：所有登录用户可读；ADMIN/OPERATOR 可写
create policy "version_snapshots_select" on public.version_snapshots
  for select using (auth.uid() is not null);

create policy "version_snapshots_insert" on public.version_snapshots
  for insert with check (
    public.current_user_role() in ('ADMIN', 'OPERATOR')
  );

-- comparison_results：所有登录用户可读；系统（service_role）可写
create policy "comparison_results_select" on public.comparison_results
  for select using (auth.uid() is not null);

-- reviews：所有登录用户可读；ADMIN/REVIEWER 可写
create policy "reviews_select" on public.reviews
  for select using (auth.uid() is not null);

create policy "reviews_insert" on public.reviews
  for insert with check (
    public.current_user_role() in ('ADMIN', 'REVIEWER')
  );

-- system_config：所有登录用户可读；仅 ADMIN 可写
create policy "system_config_select" on public.system_config
  for select using (auth.uid() is not null);

create policy "system_config_update" on public.system_config
  for update using (public.current_user_role() = 'ADMIN');

-- audit_logs：所有登录用户可读
create policy "audit_logs_select" on public.audit_logs
  for select using (auth.uid() is not null);

create policy "audit_logs_insert" on public.audit_logs
  for insert with check (auth.uid() is not null);
