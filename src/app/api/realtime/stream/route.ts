// O stream SSE em memória foi substituído por /api/realtime/poll (compatível com Vercel).
// Esta rota permanece apenas para clientes antigos em cache: responde 204 (EventSource para de tentar).
export const dynamic = "force-dynamic";

export function GET() {
  return new Response(null, { status: 204 });
}
