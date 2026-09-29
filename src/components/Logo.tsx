/* eslint-disable @next/next/no-img-element */
// Logo oficial da Mazzochini Materiais Laboratoriais (public/logo.jpg).
export default function Logo({ className = "h-10", card = false }: { className?: string; card?: boolean }) {
  const img = <img src="/logo.jpg" alt="Mazzochini Materiais Laboratoriais" className={`w-auto ${className}`} />;
  if (!card) return img;
  return <div className="inline-flex items-center rounded-xl bg-white px-3 py-2 shadow-sm">{img}</div>;
}
