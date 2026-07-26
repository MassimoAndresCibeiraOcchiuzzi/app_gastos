"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { esMesValido, nombreMes, sumarMeses } from "@/lib/formato";

const FLECHA =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-black/15 text-lg leading-none transition-colors hover:bg-black/5 active:scale-95 dark:border-white/20 dark:hover:bg-white/10";

export default function SelectorMes({
  mes,
  mesDeHoy,
}: {
  mes: string;
  mesDeHoy: string;
}) {
  const router = useRouter();

  return (
    <div className="flex items-center gap-2">
      <Link
        href={`/?mes=${sumarMeses(mes, -1)}`}
        aria-label="Mes anterior"
        className={FLECHA}
      >
        ‹
      </Link>

      {/* El input nativo va transparente encima del nombre del mes: se lee
          lindo y a la vez se puede saltar a cualquier mes. */}
      <div className="relative flex-1">
        {/* first-letter y no `capitalize`: queremos "Julio de 2026", no "Julio De 2026". */}
        <div className="pointer-events-none rounded-lg px-3 py-1.5 text-center text-sm font-medium first-letter:uppercase">
          {nombreMes(mes)}
        </div>
        <input
          type="month"
          value={mes}
          title="Elegir mes"
          aria-label="Elegir mes"
          onChange={(e) => {
            if (esMesValido(e.target.value)) {
              router.push(`/?mes=${e.target.value}`);
            }
          }}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </div>

      <Link
        href={`/?mes=${sumarMeses(mes, 1)}`}
        aria-label="Mes siguiente"
        className={FLECHA}
      >
        ›
      </Link>

      {mes !== mesDeHoy && (
        <Link
          href="/"
          className="shrink-0 rounded-lg border border-black/15 px-3 py-1.5 text-xs transition-colors hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
        >
          Hoy
        </Link>
      )}
    </div>
  );
}
