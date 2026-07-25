"use client";

import { useMemo, useState } from "react";
import {
  crearCategoria,
  eliminarCategoria,
  type ResultadoEliminar,
} from "@/app/actions/categorias";
import { CATEGORIAS_CONSUMO } from "@/lib/categorias";
import type { CategoriaUsuario } from "@/lib/types";

/**
 * Estado compartido de las categorías personalizadas.
 *
 * `nombres` combina las del sistema con las del usuario, ordenadas: es lo que
 * consume el selector. `custom` conserva los ids para el modal de borrado.
 * Crear y eliminar actualizan el estado local apenas la acción del server
 * confirma, así el cambio se ve sin recargar.
 */
export function useCategorias(iniciales: CategoriaUsuario[]) {
  const [custom, setCustom] = useState<CategoriaUsuario[]>(iniciales);

  const nombres = useMemo(() => {
    const propias = custom
      .map((c) => c.nombre)
      .sort((a, b) => a.localeCompare(b, "es"));
    return [...CATEGORIAS_CONSUMO, ...propias];
  }, [custom]);

  async function crear(nombre: string): Promise<{ ok: boolean; error?: string }> {
    const resultado = await crearCategoria(nombre);
    if (resultado.ok) {
      setCustom((cs) =>
        cs.some((c) => c.id === resultado.categoria.id)
          ? cs
          : [...cs, resultado.categoria],
      );
      return { ok: true };
    }
    return { ok: false, error: resultado.error };
  }

  async function eliminar(id: string): Promise<ResultadoEliminar> {
    const resultado = await eliminarCategoria(id);
    if (resultado.ok) setCustom((cs) => cs.filter((c) => c.id !== id));
    return resultado;
  }

  return { custom, nombres, crear, eliminar };
}
