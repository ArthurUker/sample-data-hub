# GitHub Pages + Railway 改造清单

## 1. 目标与边界

目标：将现有系统改造为“GitHub Pages 托管静态前端 + Railway 托管后端 API + Supabase 托管数据库与认证”。

边界：
- GitHub Pages 仅提供静态文件托管，不能运行 Next.js 中间件、服务端渲染和 Route Handlers。
- 现有依赖服务端能力的逻辑需要迁移到 Railway 后端服务。
- Supabase 继续承担 Auth、PostgreSQL、RLS。

## 2. 现状与差异

现状（当前项目）：
- 使用 Next.js App Router。
- 使用 middleware 进行登录态重定向。
- 使用 app/api 下的 Route Handlers 提供导入导出能力。
- 使用服务端 Supabase 客户端读取受保护数据。

差异（目标架构）：
- 前端需要变成纯静态应用，可被一次构建后直接托管。
- 所有服务端逻辑迁到独立后端服务。
- 前端通过 HTTPS 调用 Railway API。

## 3. 目标架构

- 前端（GitHub Pages）
  - 技术：React SPA（推荐）或 Next.js 静态导出模式
  - 职责：登录页面、业务页面、调用 API、渲染数据
- 后端（Railway）
  - 技术：Node.js（Express/Fastify/Nest 任一）
  - 职责：鉴权、业务 API、Excel 导入导出、权限校验
- 数据层（Supabase）
  - 职责：用户认证、业务库、RLS

## 4. 分阶段改造清单

### 阶段 A：前端静态化

1. 移除对 Next.js 运行时服务端能力的直接依赖。
2. 将页面数据获取改为浏览器端 API 请求（fetch/axios）。
3. 替换 middleware 的登录态拦截：
   - 改为前端路由守卫（进入受保护页面前检查会话）。
4. 梳理并改造以下依赖点：
   - 服务端组件中的 Supabase 查询。
   - app/api 的本地调用路径（改为 Railway API Base URL）。

交付物：
- 可静态构建的前端工程。
- 统一 API 客户端模块（例如 lib/api-client.ts）。

### 阶段 B：后端服务抽离到 Railway

1. 新建后端服务项目（建议目录 backend/ 或独立仓库）。
2. 建立基础能力：
   - 健康检查接口：GET /health
   - 统一错误处理
   - 日志与请求 ID
3. 建立鉴权中间件：
   - 解析前端 Bearer Token
   - 使用 Supabase JWT 或官方方式校验
4. 实现业务接口（按当前功能优先级）：
   - 样本列表查询
   - 样本详情查询
   - 新建/编辑检测记录
   - 版本与比对查询
   - 审核提交
   - 导入模板下载
   - 导出结果下载
5. 在后端执行权限控制：
   - 保持与角色矩阵一致（ADMIN/OPERATOR/REVIEWER/VIEWER）

交付物：
- 可在 Railway 一键启动的后端服务。
- OpenAPI 或接口文档（至少包含请求/响应示例）。

### 阶段 C：前后端联调

1. 前端环境变量接入 Railway API 地址。
2. 配置跨域策略（CORS）：
   - 仅允许 GitHub Pages 域名。
   - 允许 Authorization、Content-Type。
3. 验证关键链路：
   - 登录
   - 样本列表
   - 样本详情
   - 导入/导出
   - 审核流转

交付物：
- 端到端可用的测试环境。

### 阶段 D：上线与回归

1. 前端发布到 GitHub Pages。
2. 后端发布到 Railway。
3. 配置生产环境变量和域名。
4. 做角色权限回归测试与性能检查。

交付物：
- 可公开访问的系统地址。
- 可回滚版本与发布记录。

## 5. 接口迁移映射（建议）

可按现有业务模块拆分为以下后端路由：

- /api/auth/*
  - 会话校验、用户信息
- /api/samples/*
  - 样本列表、详情、新建、更新
- /api/records/*
  - 检测记录与检测项目
- /api/versions/*
  - 版本时间线、定版操作
- /api/comparisons/*
  - 比对结果查询
- /api/reviews/*
  - 审核结论提交与查询
- /api/import/*
  - Excel 导入
- /api/export/*
  - Excel 导出、模板下载

说明：最终路径可调整，但应保持前端调用一致性和可测试性。

## 6. 环境变量清单

前端（GitHub Pages 构建时注入）：
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- NEXT_PUBLIC_DB_SCHEMA=sample_data_hub
- NEXT_PUBLIC_API_BASE_URL=https://<railway-domain>

后端（Railway）：
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- SUPABASE_DB_SCHEMA=sample_data_hub
- CORS_ALLOW_ORIGIN=https://<github-username>.github.io
- NODE_ENV=production

安全要求：
- SERVICE_ROLE_KEY 仅在后端使用，严禁下发到前端。

## 7. 数据与权限准备

1. 确保迁移已完成：
   - sample_data_hub schema
   - 11 张业务表
   - RLS 已启用
   - policies 已创建
2. 初始化测试用户：
   - 在 auth.users 创建测试用户
   - 在 sample_data_hub.profiles 赋予角色
3. 初始化基础数据：
   - sites
   - system_config（阈值等）

## 8. 验收检查表

功能验收：
- 能成功登录并保持会话。
- 按角色展示和限制页面操作。
- 样本的创建、编辑、版本记录正常。
- 差异比对和审核流程可用。
- Excel 导入导出可用。

部署验收：
- GitHub Pages 可正常加载前端页面。
- Railway API 可从公网访问并受 CORS 限制。
- 前后端联调无 401/403 误判。
- 后端日志可追踪关键请求。

## 9. 风险与规避

风险 1：静态化后丢失原有服务端鉴权逻辑。
- 规避：前端路由守卫 + 后端强制鉴权双保险。

风险 2：跨域或 Cookie 策略导致登录态异常。
- 规避：统一使用 Bearer Token，减少跨域 Cookie 依赖。

风险 3：导入导出文件处理超时。
- 规避：后端设置超时与文件大小限制，必要时异步任务化。

风险 4：角色权限不一致。
- 规避：以数据库 RLS 和后端角色判定为准，前端仅做体验层限制。

## 10. 建议执行顺序（两周样例）

第 1-2 天：梳理现有服务端依赖，确定 API 清单。
第 3-5 天：后端骨架与鉴权中间件完成。
第 6-8 天：核心业务 API 完成，前端改调用。
第 9-10 天：导入导出与权限联调。
第 11-12 天：部署到 Railway 与 Pages。
第 13-14 天：回归测试与上线收口。
