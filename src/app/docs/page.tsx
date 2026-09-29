"use client";
import { useEffect } from "react";

// Swagger UI carregado via CDN (sem dependências extras)
export default function DocsPage() {
  useEffect(() => {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "https://unpkg.com/swagger-ui-dist@5/swagger-ui.css";
    document.head.appendChild(css);
    const s = document.createElement("script");
    s.src = "https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js";
    s.onload = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).SwaggerUIBundle({ url: "/api/docs", dom_id: "#swagger", deepLinking: true });
    };
    document.body.appendChild(s);
    return () => {
      css.remove();
      s.remove();
    };
  }, []);
  return (
    <div className="min-h-screen bg-white">
      <div className="bg-slate-900 px-6 py-3 text-sm text-white">
        <a href="/" className="font-semibold">← Controle de Vendedores</a> · Documentação da API (Swagger / OpenAPI 3)
      </div>
      <div id="swagger" />
    </div>
  );
}
