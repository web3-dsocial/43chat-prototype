/**
 * World IM — Health Check (Cloudflare Pages Function / Worker)
 *
 * GET /api/health
 * Returns world metadata. This Pages Function runs as a Cloudflare Worker at the edge.
 */
export async function onRequestGet(context) {
  return new Response(JSON.stringify({
    world: 'World IM',
    status: 'alive',
    physics: [
      'Sequential Ordering',
      'Voluntary Participation',
      'Directedness',
      'Persistent Identity',
      'Information Axiom',
    ],
    inhabitants: ['Vera', 'Marsh', 'Kael', 'Lumen'],
    message: 'The world is running. Enter voluntarily.',
    timestamp: new Date().toISOString(),
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
