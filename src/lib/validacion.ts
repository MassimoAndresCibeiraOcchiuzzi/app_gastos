import { CATEGORIA_AJUSTES, MAX_CATEGORIA } from "./categorias";
import { admiteFijo } from "./fijos";
import { MONTO_MAXIMO, esFechaISO, parsearMonto } from "./formato";
import type { CampoFormulario } from "./formulario";
import type { Origen, Tipo } from "./types";

export const MAX_DESCRIPCION = 200;
export const MAX_CUENTA = 60;

/**
 * Rango de fechas aceptado. Coincide con el CHECK de `transacciones`
 * (supabase/checks_transacciones.sql): un año mal tipeado ("0202") no entra.
 * Las fechas ISO se comparan bien como texto.
 */
export const FECHA_MINIMA = "2000-01-01";
export const FECHA_MAXIMA = "2100-12-31";

/** Lo que llega del formulario o de la tabla de importación: todo texto. */
export type EntradaTransaccion = {
  monto: string;
  descripcion: string;
  tipo: string;
  categoria: string;
  cuenta: string;
  fecha: string;
  /** Casilla "Gasto fijo". Opcional: lo que no la trae, no es fijo. */
  es_fijo?: boolean;
};

/**
 * ¿Puede esta transacción tener monto negativo? Sólo el ajuste neteado de
 * impuestos: un egreso negativo (más devoluciones que percepciones) resta de
 * los egresos del mes. Se decide acá, con la categoría y el tipo, y nunca con
 * un flag que mande el cliente. Es la misma regla que el CHECK de la base.
 */
export function admiteMontoNegativo(categoria: string, tipo: string): boolean {
  return categoria === CATEGORIA_AJUSTES && tipo === "egreso";
}

/** Lo que se puede insertar en `transacciones` (falta usuario_id y origen). */
export type TransaccionValida = {
  fecha: string;
  descripcion: string;
  monto: number;
  tipo: Tipo;
  categoria: string;
  cuenta: string | null;
  /** Sólo puede ser true en un egreso que no sea el ajuste (`admiteFijo`). */
  es_fijo: boolean;
};

export type ResultadoValidacion =
  | { ok: true; valor: TransaccionValida }
  | { ok: false; errores: Partial<Record<CampoFormulario, string>> };

/**
 * Única fuente de verdad de qué es una transacción válida. La usan el alta
 * manual y la importación de PDF: lo que viene del cliente nunca se confía,
 * ni siquiera cuando ya pasó por la pantalla de revisión.
 */
export function validarTransaccion(
  entrada: EntradaTransaccion,
): ResultadoValidacion {
  const errores: Partial<Record<CampoFormulario, string>> = {};

  // Categoría y tipo primero: de ellos depende si el monto puede ser negativo.
  const categoria = entrada.categoria.trim();
  const tipo = entrada.tipo;

  const monto = parsearMonto(entrada.monto);
  if (monto === null) {
    errores.monto = "Poné un número.";
  } else if (monto === 0) {
    errores.monto = "No puede ser cero.";
  } else if (monto < 0 && !admiteMontoNegativo(categoria, tipo)) {
    errores.monto = "Tiene que ser mayor a cero.";
  } else if (Math.abs(monto) > MONTO_MAXIMO) {
    errores.monto = "Demasiado grande.";
  }

  const descripcion = entrada.descripcion.trim();
  if (descripcion === "") {
    errores.descripcion = "No puede quedar vacía.";
  } else if (descripcion.length > MAX_DESCRIPCION) {
    errores.descripcion = `Máximo ${MAX_DESCRIPCION} caracteres.`;
  }

  if (tipo !== "ingreso" && tipo !== "egreso") {
    errores.tipo = "Elegí ingreso o egreso.";
  }

  // La categoría es texto libre: puede ser del sistema o una personalizada del
  // usuario. Sólo validamos que no esté vacía y que no sea absurdamente larga;
  // qué categorías existen lo maneja el selector, no esta función pura.
  if (categoria === "") {
    errores.categoria = "Elegí una categoría.";
  } else if (categoria.length > MAX_CATEGORIA) {
    errores.categoria = `Máximo ${MAX_CATEGORIA} caracteres.`;
  }

  const cuenta = entrada.cuenta.trim();
  if (cuenta.length > MAX_CUENTA) {
    errores.cuenta = `Máximo ${MAX_CUENTA} caracteres.`;
  }

  const fecha = entrada.fecha;
  if (!esFechaISO(fecha)) {
    errores.fecha = "Fecha inválida.";
  } else if (fecha < FECHA_MINIMA || fecha > FECHA_MAXIMA) {
    errores.fecha = "La fecha tiene que estar entre el año 2000 y el 2100.";
  }

  if (Object.keys(errores).length > 0) return { ok: false, errores };

  return {
    ok: true,
    valor: {
      fecha,
      descripcion,
      monto: monto!,
      tipo: tipo as Tipo,
      categoria,
      cuenta: cuenta === "" ? null : cuenta,
      // Un ingreso tildado como fijo se guarda como no fijo, sin error: la
      // casilla ni se muestra para ingresos.
      es_fijo: entrada.es_fijo === true && admiteFijo(tipo, categoria),
    },
  };
}

/** Arma la fila tal como entra en la tabla `transacciones`. */
export function aFilaTransaccion(
  valor: TransaccionValida,
  usuarioId: string,
  origen: Origen,
) {
  const { es_fijo, ...resto } = valor;
  // `es_fijo` sólo viaja si es true: así, si todavía no se corrió
  // supabase/gastos_fijos.sql, cargar un gasto no fijo sigue andando (la
  // columna tiene default false).
  return { ...resto, ...(es_fijo ? { es_fijo } : {}), origen, usuario_id: usuarioId };
}
