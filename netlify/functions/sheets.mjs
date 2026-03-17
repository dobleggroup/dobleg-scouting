export default async (request, context) => {
  const url = new URL(request.url)
  const sheetUrl = url.searchParams.get('url')

  if (!sheetUrl) {
    return new Response(JSON.stringify({ error: 'Missing url parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  if (!sheetUrl.startsWith('https://docs.google.com/')) {
    return new Response(JSON.stringify({ error: 'Invalid URL' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  try {
    const response = await fetch(sheetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ScoutPlatform/1.0)',
      },
      redirect: 'follow',
    })

    if (!response.ok) {
      return new Response(JSON.stringify({ error: `HTTP ${response.status}` }), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const text = await response.text()

    return new Response(text, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'text/csv; charset=utf-8',
        'Cache-Control': 'public, max-age=60',
      }
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}

export const config = {
  path: "/.netlify/functions/sheets"
}
