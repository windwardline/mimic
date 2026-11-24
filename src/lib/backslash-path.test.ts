import { describe, expect, it } from 'vitest';
import nextConfig from '../../next.config';

// Next's own matcher, so the test reads the source exactly as Next does. It
// ships without type declarations, hence the typed dynamic import.
const NEXT_PATH_TO_REGEXP: string = 'next/dist/compiled/path-to-regexp';
const { pathToRegexp } = (await import(NEXT_PATH_TO_REGEXP)) as {
  pathToRegexp: (source: string) => RegExp;
};

// Production answered 500 for any real route followed by `%5C` (`/api/convert%5C`)
// while an unknown route with the same suffix answered 404. The fix is a
// beforeFiles rewrite in next.config.ts; this keeps it in place. The deployed
// proof is a preview request: `/api/convert%5C` must answer 404.

async function beforeFiles() {
  const rewrites = await nextConfig.rewrites?.();
  if (!rewrites || Array.isArray(rewrites)) return [];
  return rewrites.beforeFiles ?? [];
}

async function matches(path: string) {
  const rules = await beforeFiles();
  return rules.some((r) => pathToRegexp(r.source).test(path));
}

describe('backslash paths answer 404 (next.config rewrites)', () => {
  it('sends an encoded backslash after a real route to a path with no route', async () => {
    for (const path of ['/%5C', '/api/convert%5C', '/api/convert%5c', '/x%5Cy']) {
      expect(await matches(path), path).toBe(true);
    }
  });

  it('leaves ordinary paths alone', async () => {
    for (const path of ['/', '/api/convert']) {
      expect(await matches(path), path).toBe(false);
    }
  });

  it('rewrites to a path that cannot redirect off-site', async () => {
    for (const rule of await beforeFiles()) {
      expect(rule.destination.startsWith('/') && !rule.destination.startsWith('//')).toBe(true);
    }
  });
});
