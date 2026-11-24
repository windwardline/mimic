import { describe, expect, it } from 'vitest';
import { POST } from '../app/api/convert/route';

// A request that is not multipart form data is the caller's mistake. It must
// answer 400 with the usage message, never the 500 reserved for our failures.
describe('POST /api/convert', () => {
  it('answers 400 to a request with no body', async () => {
    const res = await POST(new Request('https://x.test/api/convert', { method: 'POST' }));
    expect(res.status).toBe(400);
  });

  it('answers 400 to a JSON body', async () => {
    const res = await POST(
      new Request('https://x.test/api/convert', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"file":"x"}',
      }),
    );
    expect(res.status).toBe(400);
  });

  it('answers 400 to a form without a file field', async () => {
    const form = new FormData();
    form.set('other', 'x');
    const res = await POST(
      new Request('https://x.test/api/convert', { method: 'POST', body: form }),
    );
    expect(res.status).toBe(400);
  });
});
