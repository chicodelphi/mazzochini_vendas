export async function register() {
  // Na Vercel (serverless) não há processo contínuo: o monitor roda sob demanda
  // (ver tickSeDevido em src/lib/monitor.ts). Em Docker/servidor próprio usa o loop.
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.VERCEL !== "1") {
    const { startMonitor } = await import("@/lib/monitor");
    startMonitor();
  }
}
