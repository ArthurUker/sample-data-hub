// 静态导出模式下 middleware 不运行。
// 路由保护由 lib/auth-context.tsx + app/(main)/layout.tsx 客户端守卫完成。
export function middleware() {}

export const config = {
  matcher: [],
}
