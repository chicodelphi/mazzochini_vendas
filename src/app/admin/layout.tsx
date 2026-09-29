"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/useAuth";
import Logo from "@/components/Logo";
import LimparDados from "@/components/LimparDados";

const NAV = [
  { href: "/admin", label: "Dashboard", icon: "◉" },
  { href: "/admin/vendedores", label: "Vendedores", icon: "◎" },
  { href: "/admin/atendimentos", label: "Atendimentos", icon: "✎" },
  { href: "/admin/relatorios", label: "Relatórios", icon: "▤" },
  { href: "/docs", label: "API", icon: "❮❯" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth(["admin"]);
  const path = usePathname();
  if (!user)
    return (
      <div className="grid min-h-screen place-items-center">
        <Logo className="h-10 animate-pulse opacity-60" />
      </div>
    );

  const isActive = (href: string) => (href === "/admin" ? path === "/admin" : path.startsWith(href));

  return (
    <div className="flex min-h-screen">
      <aside className="glass sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-slate-200/80 p-5 md:flex">
        <Link href="/admin" className="mb-1 block px-1">
          <Logo className="h-11" />
        </Link>
        <p className="mb-8 mt-2 px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
          Controle de Vendedores
        </p>
        <nav className="space-y-1">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[15px] font-medium ${
                isActive(n.href)
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-900/5 hover:text-slate-900"
              }`}
            >
              <span className={`w-5 text-center text-sm ${isActive(n.href) ? "text-indigo-400" : "text-slate-400"}`}>{n.icon}</span>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto rounded-2xl bg-slate-900/[0.04] p-3.5">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-indigo-400 text-sm font-bold text-slate-900">
              {user.nome.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{user.nome}</p>
              <p className="text-xs text-slate-500">Gestor</p>
            </div>
          </div>
          <LimparDados className="mt-3 w-full rounded-lg border border-red-200 bg-white py-2 text-sm font-medium text-red-600 hover:bg-red-50" />
          <button onClick={logout} className="mt-2 w-full rounded-lg bg-white py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
            Sair
          </button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="glass sticky top-0 z-[1100] flex items-center gap-2 overflow-x-auto border-b border-slate-200/80 px-3 py-2 md:hidden">
          <Logo className="mr-1 h-7 shrink-0" />
          {NAV.slice(0, 4).map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium ${isActive(n.href) ? "bg-slate-900 text-white" : "text-slate-600"}`}
            >
              {n.label}
            </Link>
          ))}
          <LimparDados label="🗑 Apagar" className="ml-auto shrink-0 rounded-full px-3 py-1.5 text-sm text-red-600" />
          <button onClick={logout} className="shrink-0 rounded-full px-3 py-1.5 text-sm text-slate-500">Sair</button>
        </header>
        <main key={path} className="animate-rise mx-auto max-w-[1600px] p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
