import {
  assertSafeOutboundUrl,
  fetchWithSafeRedirects,
  resolveSafeOutboundHost,
} from './outbound-http';

describe('outbound HTTP security', () => {
  it.each([
    'http://127.0.0.1/admin',
    'http://169.254.169.254/latest/meta-data',
    'http://[::1]/admin',
    'ftp://example.com/file',
    'https://user:password@example.com/hook',
  ])('rejects unsafe URL %s', async (url) => {
    await expect(assertSafeOutboundUrl(url)).rejects.toThrow();
  });

  it('rejects hostnames when any resolved address is private', async () => {
    await expect(
      assertSafeOutboundUrl('https://rebind.example/hook', async () => [
        { address: '203.0.113.10', family: 4 },
        { address: '10.0.0.10', family: 4 },
      ]),
    ).rejects.toThrow('private or reserved');
  });

  it('validates redirect destinations before following them', async () => {
    const fetcher = jest.fn().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: 'http://169.254.169.254/latest/meta-data' },
      }),
    );
    const lookup = async () => [{ address: '93.184.216.34', family: 4 as const }];

    await expect(
      fetchWithSafeRedirects(
        'https://example.com/hook',
        { method: 'POST' },
        { fetcher: fetcher as typeof fetch, lookup },
      ),
    ).rejects.toThrow('private or reserved');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('rejects private SMTP destinations before credentials can be sent', async () => {
    await expect(
      resolveSafeOutboundHost('smtp.internal.example', async () => [
        { address: '10.20.30.40', family: 4 },
      ]),
    ).rejects.toThrow('private or reserved');
  });
});
