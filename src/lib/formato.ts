/** Zona horaria de referencia: "hoy" siempre se calcula en hora argentina. */
export const ZONA_HORARIA = "America/Argentina/Buenos_Aires";

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const RE_MES = /^\d{4}-\d{2}$/;

// ---------------------------------------------------------------- dinero

const FORMATO_ARS = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 1234.5 -> "$ 1.234,50" */
export function formatearARS(monto: number): string {
  return FORMATO_ARS.format(monto);
}

/** Igual que formatearARS pero forzando el signo (+/-). */
export function formatearARSConSigno(monto: number): string {
  const signo = monto > 0 ? "+" : monto < 0 ? "−" : "";
  return `${signo}${FORMATO_ARS.format(Math.abs(monto))}`;
}

/** Máximo que entra en numeric(14,2). */
export const MONTO_MAXIMO = 999_999_999_999.99;

/**
 * Acepta lo que la gente escribe de verdad: "1234.56", "1.234,56", "$ 1234",
 * "1234,5". Devuelve null si no es un número usable.
 */
export function parsearMonto(entrada: string): number | null {
  const limpio = entrada.replace(/[\s$ ]/g, "");
  if (limpio === "") return null;

  const tienePunto = limpio.includes(".");
  const tieneComa = limpio.includes(",");

  let normalizado: string;
  if (tienePunto && tieneComa) {
    // "1.234,56" -> el último separador manda como decimal
    normalizado =
      limpio.lastIndexOf(",") > limpio.lastIndexOf(".")
        ? limpio.replace(/\./g, "").replace(",", ".")
        : limpio.replace(/,/g, "");
  } else if (tieneComa) {
    normalizado = limpio.replace(",", ".");
  } else if (tienePunto) {
    // Sólo puntos. En es-AR "12.500" son doce mil quinientos, no doce y medio:
    // si hay más de un punto, o el último grupo tiene exactamente 3 dígitos,
    // lo tomamos como separador de miles.
    const grupos = limpio.split(".");
    const ultimo = grupos[grupos.length - 1];
    normalizado =
      grupos.length > 2 || (grupos.length === 2 && /^\d{3}$/.test(ultimo))
        ? grupos.join("")
        : limpio;
  } else {
    normalizado = limpio;
  }

  if (!/^-?\d*\.?\d*$/.test(normalizado)) return null;

  const numero = Number(normalizado);
  if (!Number.isFinite(numero)) return null;

  return Math.round(numero * 100) / 100;
}

// ---------------------------------------------------------------- fechas

/** Fecha de hoy en hora argentina, como "YYYY-MM-DD". */
export function hoyISO(): string {
  // en-CA formatea como YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA_HORARIA }).format(
    new Date(),
  );
}

/** Mes actual en hora argentina, como "YYYY-MM". */
export function mesActual(): string {
  return hoyISO().slice(0, 7);
}

export function esFechaISO(valor: unknown): valor is string {
  if (typeof valor !== "string" || !RE_FECHA.test(valor)) return false;
  const [a, m, d] = valor.split("-").map(Number);
  const fecha = new Date(Date.UTC(a, m - 1, d));
  return (
    fecha.getUTCFullYear() === a &&
    fecha.getUTCMonth() === m - 1 &&
    fecha.getUTCDate() === d
  );
}

export function esMesValido(valor: unknown): valor is string {
  if (typeof valor !== "string" || !RE_MES.test(valor)) return false;
  const mes = Number(valor.slice(5, 7));
  return mes >= 1 && mes <= 12;
}

/** "2026-07" -> "2026-07-01" */
export function primerDia(mes: string): string {
  return `${mes}-01`;
}

/** Rango [desde, hasta) que cubre el mes. `hasta` es el día 1 del mes siguiente. */
export function rangoMes(mes: string): { desde: string; hasta: string } {
  return { desde: primerDia(mes), hasta: primerDia(sumarMeses(mes, 1)) };
}

export function sumarMeses(mes: string, delta: number): string {
  const anio = Number(mes.slice(0, 4));
  const numeroMes = Number(mes.slice(5, 7));
  const total = anio * 12 + (numeroMes - 1) + delta;
  const nuevoAnio = Math.floor(total / 12);
  const nuevoMes = (total % 12) + 1;
  return `${String(nuevoAnio).padStart(4, "0")}-${String(nuevoMes).padStart(2, "0")}`;
}

const FORMATO_MES = new Intl.DateTimeFormat("es-AR", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** "2026-07" -> "julio de 2026" */
export function nombreMes(mes: string): string {
  const fecha = new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)) - 1, 1));
  return FORMATO_MES.format(fecha);
}

const MESES_CORTOS = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

/**
 * "2026-07-23" -> "23 jul".
 * Se arma a mano y no con Intl: la columna es `date` (sin hora), así que
 * convertirla a Date local correría el día para atrás según la zona horaria.
 */
export function formatearFechaCorta(fecha: string): string {
  const [, mes, dia] = fecha.split("-");
  return `${dia} ${MESES_CORTOS[Number(mes) - 1]}`;
}

/**
 * "2026-06-03" -> "03/06/2026". Con año, porque se usa para mostrar la fecha
 * de compra original de un resumen, que puede ser de hace varios meses.
 * Si no es una fecha ISO, devuelve lo que vino: es dato de referencia, no
 * queremos inventar nada ni romper la pantalla.
 */
export function formatearFechaNumerica(fecha: string): string {
  if (!esFechaISO(fecha)) return fecha;
  const [anio, mes, dia] = fecha.split("-");
  return `${dia}/${mes}/${anio}`;
}

/**
 * Etiqueta corta para el eje del gráfico de meses: "jul", y con el año cuando
 * arranca uno nuevo ("ene 26"), para que una serie a caballo de dos años no
 * quede ambigua.
 */
export function etiquetaMesCorta(mes: string): string {
  const numero = Number(mes.slice(5, 7));
  const corto = MESES_CORTOS[numero - 1];
  return numero === 1 ? `${corto} ${mes.slice(2, 4)}` : corto;
}

/** Para los ticks del eje Y: "$ 1,2 M", "$ 350 k", "$ 900". */
export function formatearCompacto(monto: number): string {
  const signo = monto < 0 ? "-" : "";
  const abs = Math.abs(monto);
  const conUnidad = (valor: number, unidad: string) =>
    `${signo}$ ${valor.toLocaleString("es-AR", { maximumFractionDigits: 1 })} ${unidad}`;

  if (abs >= 1_000_000) return conUnidad(abs / 1_000_000, "M");
  if (abs >= 1_000) return conUnidad(abs / 1_000, "k");
  return `${signo}$ ${abs.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
}

/** Los `cantidad` meses que terminan en `mes`, del más viejo al más nuevo. */
export function ultimosMeses(mes: string, cantidad: number): string[] {
  return Array.from({ length: cantidad }, (_, i) =>
    sumarMeses(mes, i - (cantidad - 1)),
  );
}
