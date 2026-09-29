"use client";

import { createContext, useContext } from "react";
import { useCategorias } from "@/components/use-categorias";
import type { ReglaCategoria } from "@/lib/reglas";
import type { CategoriaUsuario } from "@/lib/types";

type ContextoMovimientos = ReturnType<typeof useCategorias> & {
  /** Cuentas ya usadas este mes, para sugerir en el campo Cuenta. */
  cuentasConocidas: string[];
  /** Reglas por comercio guardadas. Llegan frescas del servidor. */
  reglas: ReglaCategoria[];
};

const Contexto = createContext<ContextoMovimientos | null>(null);

/**
 * Comparte la lista de categorías entre el alta, el gestor y la edición de
 * cada fila de Movimientos: si creás una categoría editando un gasto, aparece
 * al toque en el formulario de alta y en el modal, y al revés.
 *
 * Las reglas no van a estado local: cada acción que las toca revalida la
 * página y vuelven por props.
 */
export default function ProveedorMovimientos({
  categoriasIniciales,
  cuentasConocidas,
  reglas,
  children,
}: {
  categoriasIniciales: CategoriaUsuario[];
  cuentasConocidas: string[];
  reglas: ReglaCategoria[];
  children: React.ReactNode;
}) {
  const categorias = useCategorias(categoriasIniciales);
  return (
    <Contexto.Provider value={{ ...categorias, cuentasConocidas, reglas }}>
      {children}
    </Contexto.Provider>
  );
}

export function useMovimientos(): ContextoMovimientos {
  const valor = useContext(Contexto);
  if (!valor) {
    throw new Error("useMovimientos va adentro de <ProveedorMovimientos>.");
  }
  return valor;
}
