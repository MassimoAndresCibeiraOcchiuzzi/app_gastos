"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SECCIONES = [
  { href: "/", etiqueta: "Movimientos" },
  { href: "/dashboard", etiqueta: "Dashboard" },
  { href: "/importar", etiqueta: "Importar" },
];

/** Tabs entre las dos pantallas, manteniendo el mes que estás mirando. */
export default function Navegacion({ mes }: { mes: string }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Secciones"
      className="flex gap-1 rounded-xl border border-black/10 p-1 dark:border-white/15"
    >
      {SECCIONES.map(({ href, etiqueta }) => {
        const activa = pathname === href;
        return (
          <Link
            key={href}
            href={`${href}?mes=${mes}`}
            aria-current={activa ? "page" : undefined}
            className={`flex-1 rounded-lg px-3 py-1.5 text-center text-sm transition-colors ${
              activa
                ? "bg-foreground font-medium text-background"
                : "hover:bg-black/5 dark:hover:bg-white/10"
            }`}
          >
            {etiqueta}
          </Link>
        );
      })}
    </nav>
  );
}
