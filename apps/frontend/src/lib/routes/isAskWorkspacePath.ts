export function isAskWorkspacePath(pathname?: string | null): boolean {
  return pathname === '/dashboard/ask' || Boolean(pathname?.startsWith('/dashboard/ask/'));
}
