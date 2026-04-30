# 技术架构方案

## 1. 技术选型

| 层次 | 技术 | 说明 |
|------|------|------|
| 前端框架 | Next.js 14（App Router） | React Server Components + Client Components |
| 语言 | TypeScript | 全栈统一 |
| 数据库 | Supabase（PostgreSQL） | 托管数据库，支持 Auth、RLS、实时订阅 |
| 数据库客户端 | @supabase/supabase-js | 官方 JS 客户端，集成 Auth 与 RLS |
| 数据库迁移 | Supabase CLI | SQL 迁移文件管理 |
| 认证 | Supabase Auth | 内置邮箱登录、会话管理；角色通过 profiles 表扩展 |
| UI 组件库 | shadcn/ui + Tailwind CSS | 可复用组件 |
| Excel 处理 | xlsx（SheetJS） | 导入/导出 |
| 部署 | Vercel + Supabase Cloud | Vercel 托管前端与 API，Supabase 托管数据库与认证 |

---

## 2. 项目目录结构

```
sample-data-hub/
├── app/                         # Next.js App Router
│   ├── (auth)/login/            # 登录页
│   ├── (main)/
│   │   ├── samples/             # 样本总览页
│   │   ├── samples/[id]/        # 样本详情页
│   │   ├── samples/[id]/edit/   # 录入与编辑页
│   │   ├── import/              # Excel 导入页
│   │   └── review/              # 差异审核页
│   └── api/                     # Route Handlers（API）
│       ├── samples/
│       ├── records/
│       ├── versions/
│       ├── comparisons/
│       ├── reviews/
│       └── import/
├── components/                  # 共享 UI 组件
├── lib/
│   ├── supabase/
│   │   ├── client.ts            # 浏览器端 Supabase 客户端（createBrowserClient）
│   │   └── server.ts            # 服务端 Supabase 客户端（createServerClient）
│   ├── comparison.ts            # 比对计算逻辑
│   └── excel.ts                 # Excel 导入导出工具
├── supabase/
│   ├── migrations/              # SQL 迁移文件（Supabase CLI 管理）
│   └── seed.sql                 # 初始数据（系统参数、角色枚举等）
└── types/
    ├── database.types.ts        # Supabase CLI 自动生成的数据库类型
    └── index.ts                 # 业务层类型扩展
```

---

## 3. 数据库 Schema（Supabase / PostgreSQL SQL）

> 迁移文件存放在 `supabase/migrations/`，通过 `supabase db push` 应用到云端。
> Supabase CLI 生成的类型文件为 `types/database.types.ts`，执行 `supabase gen types typescript` 更新。

### 3.1 枚举类型

```sql
create type user_role as enum ('ADMIN', 'OPERATOR', 'REVIEWER', 'VIEWER');
create type sample_status as enum ('PENDING', 'IN_REVIEW', 'FINALIZED');
create type source_type as enum ('MANUAL', 'IMPORT');
create type version_action as enum ('CREATE', 'EDIT', 'IMPORT');
create type comp_status as enum ('CONSISTENT', 'DIVERGENT', 'MISSING_DATA');
create type review_conclusion as enum ('ACCEPTED', 'REJECTED');
```

### 3.2 用户扩展表（profiles）

> Supabase Auth 管理 `auth.users`；`profiles` 表存储业务角色与站点归属，通过触发器自动创建。

```sql
create table public.sites (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  created_at timestamptz not null default now()
);

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
  values (new.id, coalesce(new.raw_user_meta_data->>'name', new.email));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

### 3.3 样本

```sql
create table public.samples (
  id               text primary key,           -- 样本编号，全局唯一
  sample_type      text not null,
  sample_source    text,
  collection_date  date,
  submission_date  date,
  status           sample_status not null default 'PENDING',
  final_version_id uuid,                        -- 填充前暂为 null，审核后回填
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
```

### 3.4 检测记录与项目明细

```sql
create table public.detection_records (
  id          uuid primary key default gen_random_uuid(),
  sample_id   text not null references public.samples(id),
  site_id     uuid not null references public.sites(id),
  source_type source_type not null default 'MANUAL',
  operator_id uuid not null references public.profiles(id),
  remark      text,
  created_at  timestamptz not null default now()
);

create table public.detection_items (
  id           uuid primary key default gen_random_uuid(),
  record_id    uuid not null references public.detection_records(id) on delete cascade,
  project_name text not null,   -- 检测项目，如 "ORF1ab"
  ct_value     numeric,         -- 标准化 Ct 值
  raw_text     text,            -- 原始文本，保留
  conclusion   text,            -- 阳性 / 阴性 / 等
  is_missing   boolean not null default false,
  unit         text
);
```

### 3.5 版本与快照

```sql
create table public.versions (
  id          uuid primary key default gen_random_uuid(),
  sample_id   text not null references public.samples(id),
  record_id   uuid not null references public.detection_records(id),
  version_no  integer not null,    -- 同一 record 下的递增序号
  action_type version_action not null,
  operator_id uuid not null references public.profiles(id),
  note        text,
  is_latest   boolean not null default true,
  is_final    boolean not null default false,
  created_at  timestamptz not null default now()
);

-- 同一 record 下 version_no 唯一
create unique index versions_record_versionno_idx on public.versions(record_id, version_no);

-- 版本快照明细（完整快照策略）
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

-- samples.final_version_id 在 versions 创建后才能引用，补加外键
alter table public.samples
  add constraint samples_final_version_fk
  foreign key (final_version_id) references public.versions(id);
```

### 3.6 比对结果

```sql
create table public.comparison_results (
  id            uuid primary key default gen_random_uuid(),
  sample_id     text not null references public.samples(id),
  project_name  text not null,
  version_ids   uuid[] not null,   -- 参与比对的版本 ID 集合
  min_ct        numeric,
  max_ct        numeric,
  ct_diff       numeric,           -- max_ct - min_ct
  threshold     numeric not null,  -- 计算时的阈值快照
  comp_status   comp_status not null,
  needs_review  boolean not null default false,
  calculated_at timestamptz not null default now(),
  unique (sample_id, project_name)  -- 同一样本同一项目只保留最新结果
);
```

### 3.7 审核结果

```sql
create table public.reviews (
  id                  uuid primary key default gen_random_uuid(),
  sample_id           text not null references public.samples(id),
  reviewer_id         uuid not null references public.profiles(id),
  selected_version_id uuid not null references public.versions(id),
  conclusion          review_conclusion not null,
  remark              text,
  is_effective        boolean not null default true,
  created_at          timestamptz not null default now()
);
```

### 3.8 系统参数与操作日志

```sql
create table public.system_config (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

-- 初始阈值
insert into public.system_config (key, value) values ('ct_diff_threshold', '2');

create table public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id),
  action      text not null,
  entity_type text not null,
  entity_id   text not null,
  detail      jsonb,
  created_at  timestamptz not null default now()
);
```

---

## 3b. Row Level Security（RLS）策略

> 所有业务表启用 RLS，通过 Supabase Auth 的 `auth.uid()` 与 `profiles.role` 联合控制访问。

```sql
-- 启用 RLS
alter table public.samples enable row level security;
alter table public.detection_records enable row level security;
alter table public.versions enable row level security;
alter table public.reviews enable row level security;

-- 辅助函数：获取当前用户角色
create or replace function public.current_user_role()
returns user_role language sql security definer stable as $$
  select role from public.profiles where id = auth.uid();
$$;

-- 示例：所有登录用户可读样本
create policy "samples_select" on public.samples
  for select using (auth.uid() is not null);

-- 示例：仅 ADMIN / OPERATOR 可新增样本
create policy "samples_insert" on public.samples
  for insert with check (
    public.current_user_role() in ('ADMIN', 'OPERATOR')
  );

-- 示例：仅 ADMIN / REVIEWER 可提交审核
create policy "reviews_insert" on public.reviews
  for insert with check (
    public.current_user_role() in ('ADMIN', 'REVIEWER')
  );

-- 其余表参照相同模式，详见 supabase/migrations/ 中的完整策略文件
```

---

## 4. 核心业务逻辑

### 4.1 版本生成规则

每次"新建检测记录"或"编辑检测记录"时：

1. 创建新的 `DetectionRecord`（或复用已有 record，视编辑粒度而定）。
2. 将所有相关 `DetectionItem` 快照写入新的 `Version` + `VersionSnapshot`。
3. 将该 record 下的旧版本 `isLatest` 置为 `false`。
4. 触发比对计算。

### 4.2 比对计算触发时机

- 任意与该样本相关的版本生成后，异步重算 `ComparisonResult`。
- 系统参数（阈值）变更后，批量重算所有未定版样本的比对结果。
- 比对逻辑：按 `sampleId + projectName` 聚合当前所有站点的**最新版本**的 `VersionSnapshot`，计算 `ctDiff`。

### 4.3 审核定版规则

1. 审核人选定某个 `Version` 作为最终版。
2. 将该 `Version.isFinal` 置为 `true`，写入 `Review` 记录。
3. 更新 `Sample.finalVersionId` 和 `Sample.status = FINALIZED`。
4. 后续录入员仍可创建新版本（不会自动替换最终版）。
5. 若存在新版本导致新差异，`Sample.status` 重置为 `IN_REVIEW`，需重新审核。

### 4.4 导出规则

- 默认导出 `Sample.finalVersionId` 对应的 `VersionSnapshot` 数据。
- 未定版样本可选择导出最新版快照（附注未审核标记）。

---

## 5. API 路由设计

| Method | Path | 说明 | 权限 |
|--------|------|------|------|
| GET | `/api/samples` | 样本列表（分页、筛选） | 全部角色 |
| POST | `/api/samples` | 创建样本 | OPERATOR, ADMIN |
| GET | `/api/samples/:id` | 样本详情 + 版本时间线 + 比对结果 | 全部角色 |
| POST | `/api/samples/:id/records` | 新建检测记录（触发版本生成） | OPERATOR, ADMIN |
| PUT | `/api/records/:id` | 编辑检测记录（触发新版本） | OPERATOR, ADMIN |
| GET | `/api/samples/:id/versions` | 版本历史列表 | 全部角色 |
| GET | `/api/samples/:id/comparison` | 比对结果 | 全部角色 |
| POST | `/api/samples/:id/review` | 提交审核定版 | REVIEWER, ADMIN |
| POST | `/api/import` | Excel 导入（预览 or 提交） | OPERATOR, ADMIN |
| GET | `/api/export` | Excel 导出 | 全部角色 |
| GET | `/api/review/pending` | 待审核差异样本列表 | REVIEWER, ADMIN |
| GET | `/api/config` | 读取系统参数 | 全部角色 |
| PUT | `/api/config` | 更新系统参数（含阈值） | ADMIN |

---

## 6. 角色权限矩阵

| 操作 | ADMIN | OPERATOR | REVIEWER | VIEWER |
|------|:-----:|:--------:|:--------:|:------:|
| 查看样本列表与详情 | ✅ | ✅ | ✅ | ✅ |
| 创建样本 | ✅ | ✅ | ❌ | ❌ |
| 录入/编辑检测记录 | ✅ | ✅ | ❌ | ❌ |
| Excel 导入 | ✅ | ✅ | ❌ | ❌ |
| 提交审核定版 | ✅ | ❌ | ✅ | ❌ |
| Excel 导出 | ✅ | ✅ | ✅ | ✅ |
| 修改系统参数（阈值） | ✅ | ❌ | ❌ | ❌ |
| 管理用户与站点 | ✅ | ❌ | ❌ | ❌ |

---

## 7. 关键设计决策记录

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 版本存储策略 | 完整快照 | 回滚简单，历史数据自包含，无需重算 |
| 比对粒度 | sample_id + project_name | 与业务规则一致 |
| 比对触发 | 版本生成后异步触发 | 解耦写入与计算，保证录入响应速度 |
| 最终版替换规则 | 新录入不自动替换最终版 | 防止误操作覆盖已审核结论 |
| 阈值参数化 | 存 system_config，比对时快照阈值到结果 | 阈值变更不影响历史比对记录 |
| API 风格 | REST（Route Handlers） | Next.js 原生支持，无需额外服务 |
| 认证方案 | Supabase Auth | 内置邮箱登录、JWT、会话刷新，无需自建认证服务 |
| 权限控制 | RLS + profiles.role | 数据库层强制安全，API 层二次校验 |
| 数据库迁移 | Supabase CLI SQL 文件 | 版本化管理，支持本地 dev 与 cloud 同步 |
