import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveApiUrl } from '../urlUtils';

describe('resolveApiUrl', () => {
  beforeEach(() => {
    vi.stubGlobal('location', { origin: 'http://localhost:5181' });
  });

  it('should return path as-is if it starts with http', () => {
    expect(resolveApiUrl('http://example.com')).toBe('http://example.com');
  });

  it('should return relative path in browser environment', () => {
    expect(resolveApiUrl('/api/test')).toBe('/api/test');
  });

  it('should return full URL in Electron environment', () => {
    vi.stubGlobal('location', { origin: 'file://' });
    expect(resolveApiUrl('/api/test')).toBe('http://localhost:3007/api/test');
  });

  it('should handle missing leading slash', () => {
    expect(resolveApiUrl('api/test')).toBe('/api/test');
  });
});
