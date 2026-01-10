/**
 * Build an API endpoint path.
 * API requests are always proxied through nginx at /api
 */
export function getApiEndpoint(path: string): string {
  const cleanPath = path.startsWith("/") ? path.slice(1) : path;
  return `/api/${cleanPath}`;
}
