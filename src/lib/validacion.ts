import { esCategoriaValida } from "./categorias";
import { MONTO_MAXIMO, esFechaISO, parsearMonto } from "./formato";
import type { CampoFormulario } from "./formulario";
import type { Origen, Tipo } from "./types";

export const MAX_DESCRIPCION = 200;
export const MAX_CUENTA = 60;

/** Lo que llega del formulario o de la tabla de importación: todo texto. */
export type EntradaTransaccion = {
  monto: string;
  descripcion: string;
  tipo: string;
  categoria: string;
  cuenta: string;
  fecha: string;
  /**
   * Deja pasar un monto negativo. Sólo lo usa el ajuste neteado de impuestos:
   * un egreso negativo (más devoluciones que percepciones) resta de los
   * egresos del mes. El alta manual nunca lo setea, así que sigue exigiendo
   * montos positivos.
   */
  permitirMontoNegativo?: boolean;
};

/** Lo que se puede insertar en `transacciones` (falta usuario_id y origen). */
export type TransaccionValida = {
  fecha: string;
  descripcion: string;
  monto: number;
  tipo: Tipo;
  categoria: string;
  cuenta: string | null;
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

  const monto = parsearMonto(entrada.monto);
  if (monto === null) {
    errores.monto = "Poné un número.";
  } else if (monto === 0) {
    errores.monto = "No puede ser cero.";
  } else if (monto < 0 && !entrada.permitirMontoNegativo) {
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

  const tipo = entrada.tipo;
  if (tipo !== "ingreso" && tipo !== "egreso") {
    errores.tipo = "Elegí ingreso o egreso.";
  }

  const categoria = entrada.categoria;
  if (!esCategoriaValida(categoria)) {
    errores.categoria = "Categoría desconocida.";
  }

  const cuenta = entrada.cuenta.trim();
  if (cuenta.length > MAX_CUENTA) {
    errores.cuenta = `Máximo ${MAX_CUENTA} caracteres.`;
  }

  const fecha = entrada.fecha;
  if (!esFechaISO(fecha)) {
    errores.fecha = "Fecha inválida.";
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
    },
  };
}

/** Arma la fila tal como entra en la tabla `transacciones`. */
export function aFilaTransaccion(
  valor: TransaccionValida,
  usuarioId: string,
  origen: Origen,
) {
  return { ...valor, origen, usuario_id: usuarioId };
}
