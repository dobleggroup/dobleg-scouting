export interface Env {
  PROXY_SECRET: string;
}

const SOFASCORE_BASE = 'https://api.sofascore.com/api/v1';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST',
  'Access-Control-Allow-Headers': 'Content-Type, X-Proxy-Secret',
};

async function tryFetch(sofascoreUrl: string): Promise<Response> {
  const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(sofascoreUrl)}`;
  return fetch(proxyUrl);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const secret = request.headers.get('X-Proxy-Secret');
    if (secret !== env.PROXY_SECRET) {
      return new Response('Unauthorized', { status: 401 });
    }

    const path = url.pathname;
    if (!path.startsWith('/api/v1/')) {
      return new Response('Invalid path', { status: 400 });
    }

    const sofascoreUrl = `${SOFASCORE_BASE}${path.replace('/api/v1', '')}`;
    const res = await tryFetch(sofascoreUrl);

    return new Response(res.body, {
      status: res.status,
      headers: {
        'Content-Type': res.headers.get('Content-Type') ?? 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  },
};
