export function resolveApiUrl(path: string | undefined | null): string {
  if (!path) return '';
  if (path.startsWith('http') || path.startsWith('data:')) return path;
  const baseUrl = window.location.origin.startsWith('file') ? 'http://localhost:3007' : '';
  const cleanPath = path.startsWith('/') ? path : '/' + path;
  return baseUrl + cleanPath;
}
