#!/usr/bin/env node
/**
 * 执行数据库迁移脚本
 * 用法: DB_PASSWORD=你的密码 node scripts/run-migration.js
 *
 * 数据库密码获取方式：
 * Supabase Dashboard → Settings → Database → Database password
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const password = process.env.DB_PASSWORD;
if (!password) {
  console.error('❌ 请提供数据库密码：DB_PASSWORD=xxx node scripts/run-migration.js');
  process.exit(1);
}

const client = new Client({
  host: 'db.aitzxizdxgvnicrobqit.supabase.co',
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: password,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  console.log('正在连接数据库...');
  await client.connect();
  console.log('✅ 连接成功');

  const sql = fs.readFileSync(
    path.join(__dirname, '../supabase/migrations/001_initial_schema.sql'),
    'utf8'
  );

  console.log('正在执行迁移 SQL...');
  await client.query(sql);
  console.log('✅ 迁移完成！所有表已创建');

  await client.end();
}

main().catch(async (err) => {
  console.error('❌ 迁移失败:', err.message);
  await client.end().catch(() => {});
  process.exit(1);
});
