/**
 * Get the API URL at runtime
 * This handles both development (full URL) and production (relative path with nginx proxy)
 */
export function getApiUrl(): string {
  // Check if we're in the browser
  if (typeof window !== "undefined") {
    // In production with nginx proxy, API requests go to /api on the same domain
    // Check if we're on a deployed domain (not localhost)
    if (window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
      return window.location.origin;
    }
  }

  // For local dev or server-side rendering, use the environment variable
  return process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
}

/**
 * Get the base path for API requests
 */
export function getApiBasePath(): string {
  return "/api";
}

/**
 * Get the full API endpoint URL
 */
export function getApiEndpoint(path: string): string {
  const baseUrl = getApiUrl();
  const basePath = getApiBasePath();

  // Remove leading slash from path if present
  const cleanPath = path.startsWith("/") ? path.slice(1) : path;

  return `${baseUrl}${basePath}/${cleanPath}`;
}
