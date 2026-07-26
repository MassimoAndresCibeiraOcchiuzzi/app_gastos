"use client";

import { useState } from "react";
import { MAX_CATEGORIA } from "@/lib/categorias";
import {
  CAMPO,
  CAMPO_COMPACTO,
  CAMPO_SELECT,
  CAMPO_SELECT_COMPACTO,
} from "@/lib/ui";

/**
 * Valor centinela: elegir esta opción abre el alta de una categoría nueva.
 * Sin espacios ni caracteres raros: un webview de celular recorta del `value`
 * de un <option> los NULL y los espacios de los bordes, y ahí la comparación
 * fallaba y se guardaba "nueva" como categoría. Los guiones bajos lo hacen
 * imposible de recortar y de colisionar con una categoría real.
 */
const NUEVA = "__crear_categoria_nueva__";

/**
 * Selector de categoría que combina las del sistema con las personalizadas del
 * usuario y permite crear una nueva sin salir de la pantalla.
 *
 * La lista `categorias` la maneja el componente padre (así una categoría creada
 * en una fila aparece en todas). Al elegir "+ Agregar", `onCrear` la da de alta
 * y, si sale bien, la selecciona.
 */
export default function SelectorCategoria({
  id,
  value,
  categorias,
  onChange,
  onCrear,
  className = "",
  compacto = false,
}: {
  id?: string;
  value: string;
  categorias: string[];
  onChange: (categoria: string) => void;
  onCrear: (nombre: string) => Promise<{ ok: boolean; error?: string }>;
  className?: string;
  /** Filas densas (tabla de revisión del import): campos más chicos. */
  compacto?: boolean;
}) {
  const [creando, setCreando] = useState(false);
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  // Mismo estilo que el resto de los campos; el select con fondo opaco para que
  // el desplegable sea legible en oscuro. `compacto` lo usa la tabla de import.
  const INPUT = compacto ? CAMPO_COMPACTO : CAMPO;
  const SELECT = compacto ? CAMPO_SELECT_COMPACTO : CAMPO_SELECT;

  function abrirAlta() {
    setNombre("");
    setError(null);
    setCreando(true);
    // El foco lo da `autoFocus` al montar el input (más confiable en mobile /
    // PWA standalone que un setTimeout, que a veces no llega a enfocar).
  }

  async function confirmar() {
    const limpio = nombre.trim();
    if (limpio === "") {
      setError("Poné un nombre.");
      return;
    }
    setOcupado(true);
    setError(null);
    const resultado = await onCrear(limpio);
    setOcupado(false);
    if (!resultado.ok) {
      setError(resultado.error ?? "No se pudo crear.");
      return;
    }
    onChange(limpio);
    setCreando(false);
  }

  if (creando) {
    return (
      <div className={`animar-entrada ${className}`}>
        <div className="flex gap-1.5">
          <input
            autoFocus
            type="text"
            value={nombre}
            maxLength={MAX_CATEGORIA}
            placeholder="Nueva categoría"
            disabled={ocupado}
            onChange={(e) => setNombre(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                confirmar();
              } else if (e.key === "Escape") {
                setCreando(false);
              }
            }}
            className={INPUT}
            aria-label="Nombre de la categoría nueva"
          />
          <button
            type="button"
            onClick={confirmar}
            disabled={ocupado}
            className="shrink-0 rounded-lg bg-foreground px-2.5 text-sm font-medium text-background transition active:scale-95 disabled:opacity-50 disabled:active:scale-100"
          >
            {ocupado ? "…" : "Crear"}
          </button>
          <button
            type="button"
            onClick={() => setCreando(false)}
            disabled={ocupado}
            aria-label="Cancelar"
            className="shrink-0 rounded-lg border border-black/15 px-2.5 text-sm hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/10"
          >
            ✕
          </button>
        </div>
        {error && (
          <p role="alert" className="mt-1 text-xs text-rose-600 dark:text-rose-400">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <select
      id={id}
      value={value}
      onChange={(e) => {
        if (e.target.value === NUEVA) abrirAlta();
        else onChange(e.target.value);
      }}
      className={`${SELECT} ${className}`}
    >
      {/* Si el valor actual no está en la lista (categoría vieja borrada), lo
          mostramos igual para no perderlo. */}
      {!categorias.includes(value) && value !== "" && (
        <option value={value}>{value}</option>
      )}
      {categorias.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
      <option value={NUEVA}>+ Agregar categoría nueva</option>
    </select>
  );
}
