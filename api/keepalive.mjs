const QUERY_PATHS = [
  '/rest/v1/jobs?select=id&limit=1',
  '/rest/v1/jobs?select=id&status=eq.published&limit=1',
  '/rest/v1/jobs?select=id&archived=eq.false&limit=1',
];

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');

  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ ok: false });
  }

  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.authorization !== `Bearer ${secret}`) {
    return response.status(401).json({ ok: false });
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return response.status(500).json({ ok: false });

  try {
    for (const path of QUERY_PATHS) {
      const result = await fetch(url + path, {
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          Accept: 'application/json',
          'Cache-Control': 'no-cache',
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(8_000),
      });
      if (!result.ok) throw new Error(`Supabase returned ${result.status}`);
      await result.arrayBuffer();
    }
    return response.status(200).json({ ok: true });
  } catch (error) {
    console.error('Supabase keepalive failed', error instanceof Error ? error.message : error);
    return response.status(502).json({ ok: false });
  }
}
