/* eslint-disable @next/next/no-img-element */
/** Foto do funcionário (ou a inicial do nome sobre a cor do status, se não houver foto). */
export default function Avatar({
  nome,
  fotoUrl,
  cor = "#94a3b8",
  className = "h-9 w-9 text-sm",
}: {
  nome: string;
  fotoUrl?: string | null;
  cor?: string;
  className?: string;
}) {
  if (fotoUrl)
    return (
      <img
        src={fotoUrl}
        alt={nome}
        loading="lazy"
        className={`shrink-0 rounded-full object-cover ring-2 ${className}`}
        style={{ ["--tw-ring-color" as string]: cor }}
      />
    );
  return (
    <span className={`grid shrink-0 place-items-center rounded-full font-bold text-white ${className}`} style={{ background: cor }}>
      {nome.charAt(0).toUpperCase()}
    </span>
  );
}
