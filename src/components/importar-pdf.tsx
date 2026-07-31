"use client";

import { useRef, useState, useTransition } from "react";
import { importarTransacciones } from "@/app/actions/transacciones";
import { CATEGORIA_AJUSTES } from "@/lib/categorias";
import SelectorCategoria from "@/components/selector-categoria";
import { useCategorias } from "@/components/use-categorias";
import { CAMPO_COMPACTO, CAMPO_SELECT_COMPACTO } from "@/lib/ui";
import type { CategoriaUsuario } from "@/lib/types";
import {
  esMesValido,
  formatearARS,
  formatearFechaNumerica,
  formatearUSD,
  nombreMes,
  primerDia,
  redondearCentavos,
} from "@/lib/formato";
import {
  aCamposGuardables,
  DESCRIPCION_AJUSTES,
  TOTAL_VACIO,
  type Ajuste,
  type Descartado,
  type ItemExtraido,
  type Metodo,
  type TotalResumen,
} from "@/lib/extraccion";
import type { EntradaTransaccion } from "@/lib/validacion";

const INPUT = CAMPO_COMPACTO;
const ETIQUETA = "text-[11px] font-medium opacity-60";

type Fila = {
  id: number;
  incluir: boolean;
  /** La que se guarda: el mes en que pagás el resumen. */
  fecha: string;
  /** La de la compra, sólo de referencia. En cuotas puede ser vieja. */
  fechaOriginal: string;
  /** Si la tocaste a mano, cambiar el mes del resumen ya no la pisa. */
  fechaEditada: boolean;
  descripcion: string;
  monto: string;
  tipo: "ingreso" | "egreso";
  categoria: string;
  /**
   * El ajuste neteado de impuestos. No es un consumo: su tipo queda fijo en
   * egreso y su monto puede ser negativo (más devoluciones que percepciones).
   */
  esAjuste?: boolean;
};

type Estado = "vacio" | "analizando" | "revisando" | "guardando" | "listo";

/**
 * Lo que se guarda es el mes en que pagás el resumen, no la fecha de compra:
 * una cuota 3 de 6 se compró hace meses pero la plata sale ahora. La fecha
 * original queda a la vista como referencia.
 *
 * El resto de la traducción (monto positivo, siempre egreso, categoría
 * conocida) vive en `aCamposGuardables`, que es donde se testea.
 */
function aFila(item: ItemExtraido, id: number, fechaImputacion: string): Fila {
  return {
    id,
    incluir: true,
    fecha: fechaImputacion,
    fechaOriginal: item.fecha,
    fechaEditada: false,
    ...aCamposGuardables(item),
  };
}

/**
 * La única fila del ajuste de impuestos: el neto ya calculado por el servidor.
 * Tipo egreso siempre; monto con su signo (negativo si las devoluciones ganan).
 * No se descompone en las líneas individuales del resumen.
 */
function aFilaAjuste(ajuste: Ajuste, id: number, fechaImputacion: string): Fila {
  return {
    id,
    incluir: true,
    fecha: fechaImputacion,
    fechaOriginal: fechaImputacion,
    fechaEditada: false,
    descripcion: DESCRIPCION_AJUSTES,
    monto: ajuste.neto.toFixed(2),
    tipo: "egreso",
    categoria: CATEGORIA_AJUSTES,
    esAjuste: true,
  };
}

export default function ImportarPdf({
  mesPorDefecto,
  categoriasIniciales,
}: {
  mesPorDefecto: string;
  categoriasIniciales: CategoriaUsuario[];
}) {
  const { nombres: categorias, crear: crearCategoria } =
    useCategorias(categoriasIniciales);
  const [estado, setEstado] = useState<Estado>("vacio");
  const [error, setError] = useState<string | null>(null);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [descartados, setDescartados] = useState<Descartado[]>([]);
  const [ajuste, setAjuste] = useState<Ajuste | null>(null);
  const [metodo, setMetodo] = useState<Metodo>("texto");
  const [totalResumen, setTotalResumen] = useState<TotalResumen>(TOTAL_VACIO);
  const [mesResumen, setMesResumen] = useState(mesPorDefecto);
  const [cuenta, setCuenta] = useState("");
  // Default destildado: no importar impuestos, que es el comportamiento base.
  const [incluirImpuestos, setIncluirImpuestos] = useState(false);
  const [importadas, setImportadas] = useState(0);
  const [, iniciar] = useTransition();
  const archivoRef = useRef<HTMLInputElement>(null);

  const incluidas = filas.filter((f) => f.incluir);
  const mesOk = esMesValido(mesResumen);

  async function analizar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const archivo = archivoRef.current?.files?.[0];
    if (!archivo) return;

    if (!mesOk) {
      setError("Elegí el mes del resumen.");
      return;
    }

    setEstado("analizando");
    setError(null);

    const datos = new FormData();
    datos.append("archivo", archivo);
    datos.append("incluirImpuestos", String(incluirImpuestos));

    try {
      const respuesta = await fetch("/api/importar", {
        method: "POST",
        body: datos,
      });

      // Si venció la sesión, el proxy redirige al login.
      if (respuesta.redirected) {
        window.location.assign(respuesta.url);
        return;
      }

      const cuerpo = await respuesta.json().catch(() => null);

      if (!respuesta.ok) {
        // Si el servidor devolvió un JSON con `error`, ese es el mensaje bueno.
        // Si no (crash no controlado, timeout de la plataforma, 413 del host…),
        // el cuerpo no es JSON: mostramos algo según el status HTTP, que ya de
        // por sí dice mucho (504 = timeout, 413 = muy grande, 500 = crash).
        console.error(
          `[importar] respuesta ${respuesta.status} del servidor`,
          cuerpo ?? "(cuerpo no-JSON)",
        );
        setError(cuerpo?.error ?? mensajePorEstado(respuesta.status));
        setEstado("vacio");
        return;
      }

      const items = (cuerpo?.items ?? []) as ItemExtraido[];
      const ajusteResp = (cuerpo?.ajuste ?? null) as Ajuste | null;
      const imputacion = primerDia(mesResumen);

      // Consumos primero, y el ajuste de impuestos como última fila.
      const nuevas = items.map((item, i) => aFila(item, i, imputacion));
      if (ajusteResp) {
        nuevas.push(aFilaAjuste(ajusteResp, nuevas.length, imputacion));
      }
      setFilas(nuevas);
      setAjuste(ajusteResp);
      setDescartados((cuerpo?.descartados ?? []) as Descartado[]);
      setMetodo(cuerpo?.metodo === "vision" ? "vision" : "texto");
      setTotalResumen((cuerpo?.totalResumen ?? TOTAL_VACIO) as TotalResumen);
      setEstado("revisando");
    } catch (err) {
      // No llegó ni a haber respuesta: red caída o, muy común, el navegador
      // cortó la espera porque el servidor tardó demasiado (timeout).
      console.error("[importar] falló el fetch a /api/importar", err);
      setError(
        "Se cortó la conexión mientras analizábamos el PDF. Si el archivo es grande, puede haber sido un timeout: probá con menos páginas.",
      );
      setEstado("vacio");
    }
  }

  /** Mensaje según el status HTTP cuando el servidor no devolvió un JSON. */
  function mensajePorEstado(status: number): string {
    if (status === 504 || status === 408) {
      return "El servidor tardó demasiado y cortó el proceso (timeout). El PDF puede ser muy pesado, o el límite de tiempo del servidor es corto. Probá con menos páginas.";
    }
    if (status === 413) return "El archivo es demasiado grande.";
    if (status === 502 || status === 503) {
      return "El servicio no está disponible en este momento. Probá de nuevo en un rato.";
    }
    if (status >= 500) {
      return `Error interno del servidor (${status}). Revisá los logs del servidor para ver el detalle.`;
    }
    return `El servidor rechazó la solicitud (${status}).`;
  }

  /** Cambiar el mes reimputa todas las filas menos las que tocaste a mano. */
  function cambiarMes(mes: string) {
    setMesResumen(mes);
    if (!esMesValido(mes)) return;
    const nueva = primerDia(mes);
    setFilas((fs) =>
      fs.map((f) => (f.fechaEditada ? f : { ...f, fecha: nueva })),
    );
  }

  function editar<C extends keyof Fila>(id: number, campo: C, valor: Fila[C]) {
    setFilas((fs) => fs.map((f) => (f.id === id ? { ...f, [campo]: valor } : f)));
  }

  function editarFecha(id: number, fecha: string) {
    setFilas((fs) =>
      fs.map((f) => (f.id === id ? { ...f, fecha, fechaEditada: true } : f)),
    );
  }

  function volverAlMes(id: number) {
    if (!mesOk) return;
    setFilas((fs) =>
      fs.map((f) =>
        f.id === id
          ? { ...f, fecha: primerDia(mesResumen), fechaEditada: false }
          : f,
      ),
    );
  }

  function marcarTodas(incluir: boolean) {
    setFilas((fs) => fs.map((f) => ({ ...f, incluir })));
  }

  function confirmar() {
    setError(null);
    setEstado("guardando");

    const entradas: EntradaTransaccion[] = incluidas.map((f) => ({
      monto: f.monto,
      descripcion: f.descripcion,
      tipo: f.tipo,
      categoria: f.categoria,
      // El ajuste no lleva cuenta: no es un consumo de ninguna en particular.
      cuenta: f.esAjuste ? "" : cuenta,
      fecha: f.fecha,
      // Sólo el ajuste puede tener monto negativo (crédito neto de impuestos).
      permitirMontoNegativo: f.esAjuste,
    }));

    iniciar(async () => {
      const resultado = await importarTransacciones(entradas);
      if (!resultado.ok) {
        setError(resultado.error);
        setEstado("revisando");
        return;
      }
      setImportadas(resultado.importadas);
      setFilas([]);
      setEstado("listo");
    });
  }

  function empezarDeNuevo() {
    if (archivoRef.current) archivoRef.current.value = "";
    setFilas([]);
    setDescartados([]);
    setAjuste(null);
    setTotalResumen(TOTAL_VACIO);
    setCuenta("");
    setError(null);
    setEstado("vacio");
  }

  if (estado === "listo") {
    return (
      <div className="rounded-xl border border-black/10 p-6 text-center dark:border-white/15">
        <p className="text-sm">
          Listo: importamos <strong>{importadas}</strong>{" "}
          {importadas === 1 ? "transacción" : "transacciones"} a{" "}
          <span className="first-letter:uppercase">{nombreMes(mesResumen)}</span>.
        </p>
        <button
          type="button"
          onClick={empezarDeNuevo}
          className="mt-4 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background transition hover:opacity-90 active:scale-[.99]"
        >
          Importar otro resumen
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {(estado === "vacio" || estado === "analizando") && (
        <form
          onSubmit={analizar}
          className="flex flex-col gap-4 rounded-xl border border-black/10 p-4 dark:border-white/15"
        >
          <div>
            <label htmlFor="mes-resumen" className="block text-sm font-medium">
              Mes del resumen
            </label>
            <input
              id="mes-resumen"
              type="month"
              required
              value={mesResumen}
              onChange={(e) => cambiarMes(e.target.value)}
              disabled={estado === "analizando"}
              className={`${INPUT} mt-1.5 max-w-[11rem]`}
            />
            <p className="mt-1.5 text-xs opacity-60">
              El mes en que pagás este resumen. Todos los movimientos se van a
              registrar ahí, no en la fecha de la compra original.
            </p>
          </div>

          <div>
            <label htmlFor="archivo" className="block text-sm font-medium">
              Resumen en PDF
            </label>
            <input
              ref={archivoRef}
              id="archivo"
              name="archivo"
              type="file"
              accept="application/pdf"
              required
              disabled={estado === "analizando"}
              className="mt-1.5 block text-sm file:mr-3 file:rounded-lg file:border file:border-black/15 file:bg-transparent file:px-3 file:py-1.5 file:text-sm file:text-inherit dark:file:border-white/20"
            />
            <p className="mt-1.5 text-xs opacity-60">
              Resumen de tarjeta, de cuenta bancaria o de billetera virtual.
              Hasta 4 MB. Nada se guarda hasta que lo confirmes.
            </p>
          </div>

          <label className="flex cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              checked={incluirImpuestos}
              onChange={(e) => setIncluirImpuestos(e.target.checked)}
              disabled={estado === "analizando"}
              className="mt-0.5 h-4 w-4 shrink-0 accent-current"
            />
            <span className="text-sm">
              Incluir impuestos y percepciones del resumen
              <span className="block text-xs opacity-60">
                IIBB, IVA RG, DB.RG y devoluciones. Se netean en un solo ítem de
                ajuste. Con esto, el total importado coincide con lo que debita
                el banco.
              </span>
            </span>
          </label>

          <button
            type="submit"
            disabled={estado === "analizando"}
            className="rounded-lg bg-foreground px-4 py-2.5 text-sm font-medium text-background transition hover:opacity-90 active:scale-[.99] disabled:opacity-50 disabled:active:scale-100"
          >
            {estado === "analizando" ? "Analizando…" : "Analizar PDF"}
          </button>
          {estado === "analizando" && (
            <p aria-live="polite" className="text-xs opacity-60">
              Leyendo el resumen. Puede tardar hasta un minuto, no cierres la
              pestaña.
            </p>
          )}
        </form>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-rose-500/30 p-4 text-sm text-rose-600 dark:text-rose-400"
        >
          {error}
        </p>
      )}

      {(estado === "revisando" || estado === "guardando") && (
        <>
          {metodo === "vision" && (
            <p className="rounded-xl border border-amber-500/40 p-3 text-xs text-amber-700 dark:text-amber-400">
              Este PDF no tenía texto seleccionable (parece escaneado), así que
              lo leímos como imagen. <strong>Revisá los importes con
              atención</strong>: leyendo una imagen la IA se puede equivocar con
              los números.
            </p>
          )}

          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-sm font-medium">
                {filas.length} {filas.length === 1 ? "movimiento" : "movimientos"}{" "}
                encontrados
              </h2>
              <p className="mt-0.5 text-xs opacity-60">
                Revisá y corregí lo que haga falta. Se importan {incluidas.length}
                .
              </p>
            </div>
            <div className="flex gap-2 text-xs">
              <button
                type="button"
                onClick={() => marcarTodas(true)}
                className="rounded-lg border border-black/15 px-2.5 py-1 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
              >
                Marcar todas
              </button>
              <button
                type="button"
                onClick={() => marcarTodas(false)}
                className="rounded-lg border border-black/15 px-2.5 py-1 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
              >
                Desmarcar todas
              </button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="mes-resumen-revision" className={ETIQUETA}>
                Mes del resumen
              </label>
              <input
                id="mes-resumen-revision"
                type="month"
                value={mesResumen}
                onChange={(e) => cambiarMes(e.target.value)}
                className={`${INPUT} mt-1`}
              />
            </div>
            <div>
              <label htmlFor="cuenta" className={ETIQUETA}>
                Cuenta (se aplica a todas)
              </label>
              <input
                id="cuenta"
                type="text"
                maxLength={60}
                placeholder="Tarjeta Visa"
                value={cuenta}
                onChange={(e) => setCuenta(e.target.value)}
                className={`${INPUT} mt-1`}
              />
            </div>
          </div>

          <p className="-mt-2 text-xs opacity-60">
            Todo se registra en{" "}
            <span className="first-letter:uppercase">
              {mesOk ? nombreMes(mesResumen) : "el mes que elijas"}
            </span>
            .{" "}
            {ajuste
              ? "Los impuestos y percepciones van neteados en un solo ítem de ajuste."
              : "Los impuestos y percepciones no se importan."}{" "}
            La fecha de compra queda abajo de cada fila, sólo como referencia;
            si cambiás una a mano, cambiar el mes ya no la pisa.
          </p>

          <Checksum
            totalImportado={totalADebitar(incluidas)}
            totalResumen={totalResumen}
            incluirImpuestos={incluirImpuestos}
          />

          {ajuste && (
            <details className="-mt-2 rounded-xl border border-black/10 p-3 dark:border-white/15">
              <summary className="cursor-pointer text-xs opacity-60 hover:opacity-100">
                El ajuste netea {ajuste.lineas.length}{" "}
                {ajuste.lineas.length === 1 ? "línea" : "líneas"} de impuestos y
                devoluciones en {formatearARS(ajuste.neto)}. Ver el detalle
              </summary>
              <ul className="mt-2 flex flex-col gap-1 text-xs opacity-70">
                {ajuste.lineas.map((l, i) => (
                  <li key={i} className="flex flex-wrap justify-between gap-x-2">
                    <span className="truncate">{l.descripcion}</span>
                    <span
                      className={`tabular-nums ${
                        l.monto < 0 ? "text-emerald-700 dark:text-emerald-400" : ""
                      }`}
                    >
                      {formatearARS(l.monto)}
                    </span>
                  </li>
                ))}
                <li className="mt-1 flex flex-wrap justify-between gap-x-2 border-t border-black/10 pt-1 font-medium dark:border-white/15">
                  <span>Neto</span>
                  <span className="tabular-nums">{formatearARS(ajuste.neto)}</span>
                </li>
              </ul>
              <p className="mt-2 text-xs opacity-50">
                Las devoluciones restan. Neto negativo = ese mes el banco te
                devolvió más de lo que te cobró; entra como egreso negativo, que
                resta de los egresos sin tocar los ingresos.
              </p>
            </details>
          )}

          {descartados.length > 0 && (
            <details className="-mt-2 rounded-xl border border-black/10 p-3 dark:border-white/15">
              <summary className="cursor-pointer text-xs opacity-60 hover:opacity-100">
                Descartamos {descartados.length}{" "}
                {descartados.length === 1 ? "línea" : "líneas"} que no son
                consumos (saldos, pagos, impuestos y percepciones). Ver cuáles
              </summary>
              <ul className="mt-2 flex flex-col gap-1 text-xs opacity-70">
                {descartados.map((d, i) => (
                  <li key={i} className="flex flex-wrap gap-x-2">
                    <span className="truncate">{d.descripcion}</span>
                    <span className="opacity-60">— coincide con “{d.motivo}”</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs opacity-50">
                Si acá cayó un consumo de verdad, avisá: la lista de exclusión
                está en <code>src/lib/extraccion.ts</code>.
              </p>
            </details>
          )}

          <ul className="flex flex-col gap-3">
            {filas.map((fila) => (
              <li
                key={fila.id}
                className={`rounded-xl border border-black/10 p-3 transition-opacity dark:border-white/15 ${
                  fila.incluir ? "" : "opacity-45"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={fila.incluir}
                    onChange={(e) => editar(fila.id, "incluir", e.target.checked)}
                    aria-label={`Incluir ${fila.descripcion || "esta fila"}`}
                    className="h-4 w-4 shrink-0 accent-current"
                  />
                  <input
                    type="text"
                    maxLength={200}
                    value={fila.descripcion}
                    onChange={(e) =>
                      editar(fila.id, "descripcion", e.target.value)
                    }
                    aria-label="Descripción"
                    className={INPUT}
                  />
                </div>

                <div className="mt-2 grid grid-cols-2 gap-2 pl-[26px] sm:grid-cols-4">
                  <div>
                    <label className={ETIQUETA} htmlFor={`fecha-${fila.id}`}>
                      Fecha
                    </label>
                    <input
                      id={`fecha-${fila.id}`}
                      type="date"
                      value={fila.fecha}
                      onChange={(e) => editarFecha(fila.id, e.target.value)}
                      className={`${INPUT} mt-0.5`}
                    />
                  </div>
                  <div>
                    <label className={ETIQUETA} htmlFor={`monto-${fila.id}`}>
                      Monto
                    </label>
                    <input
                      id={`monto-${fila.id}`}
                      type="text"
                      inputMode="decimal"
                      value={fila.monto}
                      onChange={(e) => editar(fila.id, "monto", e.target.value)}
                      className={`${INPUT} mt-0.5 tabular-nums`}
                    />
                  </div>
                  <div>
                    <label className={ETIQUETA} htmlFor={`tipo-${fila.id}`}>
                      Tipo
                    </label>
                    {/* El ajuste queda fijo en egreso: un egreso negativo resta
                        de los egresos; como ingreso ensuciaría ese total. */}
                    <select
                      id={`tipo-${fila.id}`}
                      value={fila.tipo}
                      disabled={fila.esAjuste}
                      onChange={(e) =>
                        editar(fila.id, "tipo", e.target.value as Fila["tipo"])
                      }
                      className={`${CAMPO_SELECT_COMPACTO} mt-0.5 disabled:opacity-60`}
                    >
                      <option value="egreso">Egreso</option>
                      <option value="ingreso">Ingreso</option>
                    </select>
                  </div>
                  <div>
                    <label className={ETIQUETA} htmlFor={`categoria-${fila.id}`}>
                      Categoría
                    </label>
                    {fila.esAjuste ? (
                      <input
                        id={`categoria-${fila.id}`}
                        type="text"
                        value={CATEGORIA_AJUSTES}
                        disabled
                        className={`${INPUT} mt-0.5 disabled:opacity-60`}
                      />
                    ) : (
                      <SelectorCategoria
                        id={`categoria-${fila.id}`}
                        value={fila.categoria}
                        categorias={categorias}
                        onChange={(c) => editar(fila.id, "categoria", c)}
                        onCrear={crearCategoria}
                        className="mt-0.5"
                        compacto
                      />
                    )}
                  </div>
                </div>

                <p className="mt-1.5 pl-[26px] text-[11px] opacity-50">
                  {fila.esAjuste
                    ? "Neto de impuestos y percepciones del resumen"
                    : `Compra del ${formatearFechaNumerica(fila.fechaOriginal)}`}
                  {fila.fechaEditada && (
                    <>
                      {" · fecha cambiada a mano · "}
                      <button
                        type="button"
                        onClick={() => volverAlMes(fila.id)}
                        className="underline underline-offset-2 hover:opacity-100"
                      >
                        volver al mes del resumen
                      </button>
                    </>
                  )}
                </p>
              </li>
            ))}
          </ul>

          <div className="sticky bottom-4 flex flex-wrap items-center gap-3 rounded-xl border border-black/10 bg-background p-3 dark:border-white/15">
            <button
              type="button"
              onClick={confirmar}
              disabled={
                estado === "guardando" || incluidas.length === 0 || !mesOk
              }
              className="rounded-lg bg-foreground px-4 py-2.5 text-sm font-medium text-background transition hover:opacity-90 active:scale-[.99] disabled:opacity-50 disabled:active:scale-100"
            >
              {estado === "guardando"
                ? "Importando…"
                : `Confirmar e importar (${incluidas.length})`}
            </button>
            <button
              type="button"
              onClick={empezarDeNuevo}
              disabled={estado === "guardando"}
              className="text-sm underline underline-offset-4 opacity-60 hover:opacity-100 disabled:opacity-30"
            >
              Descartar
            </button>
            <span className="ml-auto text-xs tabular-nums opacity-60">
              Neto: {formatearARS(neto(incluidas))}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function neto(filas: Fila[]): number {
  const total = filas.reduce((acc, f) => {
    const monto = Number(f.monto.replace(",", ".")) || 0;
    return acc + (f.tipo === "ingreso" ? monto : -monto);
  }, 0);
  return redondearCentavos(total);
}

/**
 * Lo que se va a debitar según las filas marcadas: egresos menos ingresos.
 * Es el número que tiene que coincidir con el saldo del resumen.
 */
function totalADebitar(filas: Fila[]): number {
  return -neto(filas);
}

/** Un centavo de tolerancia, para no gritar por un redondeo. */
const TOLERANCIA = 0.01;

/**
 * Compara lo que se va a importar contra lo que el banco debita.
 * Sin esto no hay forma de saber que faltó un consumo hasta que el mes cierra
 * mal. Los dólares van aparte: no se suman con los pesos.
 */
function Checksum({
  totalImportado,
  totalResumen,
  incluirImpuestos,
}: {
  totalImportado: number;
  totalResumen: TotalResumen;
  incluirImpuestos: boolean;
}) {
  const esperado = totalResumen.pesos;

  if (esperado === null) {
    return (
      <div className="rounded-xl border border-black/10 p-3 text-xs dark:border-white/15">
        <div className="flex flex-wrap justify-between gap-x-3">
          <span className="opacity-60">Total a importar</span>
          <span className="tabular-nums">{formatearARS(totalImportado)}</span>
        </div>
        <p className="mt-2 opacity-50">
          No pudimos leer el total del resumen (SALDO ACTUAL o DEBITAREMOS), así
          que no hay con qué comparar. Revisá vos que no falte nada.
        </p>
        {totalResumen.dolares !== null && (
          <p className="mt-1 opacity-50">
            El resumen también debita {formatearUSD(totalResumen.dolares)}, que
            no se importan.
          </p>
        )}
      </div>
    );
  }

  const diferencia = redondearCentavos(totalImportado - esperado);
  const coincide = Math.abs(diferencia) <= TOLERANCIA;

  return (
    <div
      className={`rounded-xl border p-3 text-xs ${
        coincide
          ? "border-emerald-500/40"
          : "border-amber-500/50 bg-amber-500/5"
      }`}
    >
      <div className="flex flex-wrap justify-between gap-x-3">
        <span className="opacity-60">Total a importar</span>
        <span className="tabular-nums">{formatearARS(totalImportado)}</span>
      </div>
      <div className="mt-1 flex flex-wrap justify-between gap-x-3">
        <span className="opacity-60">Total del resumen</span>
        <span className="tabular-nums">{formatearARS(esperado)}</span>
      </div>

      {coincide ? (
        <p className="mt-2 text-emerald-700 dark:text-emerald-400">
          Coincide con lo que debita el banco.
        </p>
      ) : (
        <>
          <p
            role="alert"
            className="mt-2 font-medium text-amber-700 dark:text-amber-400"
          >
            Atención: la suma de lo importado no coincide con el total del
            resumen. Diferencia: {formatearARS(Math.abs(diferencia))}{" "}
            {diferencia > 0 ? "de más" : "de menos"}.
          </p>
          <p className="mt-1 opacity-60">
            {incluirImpuestos
              ? "Revisá que estén todas las líneas y que ninguna tenga el tipo o el monto cambiado. Si desmarcaste alguna a propósito, es normal que no cierre."
              : "Suele ser por los impuestos y percepciones, que no se importan. Podés tildar “Incluir impuestos” y subir de nuevo, o cargar una transacción a mano desde Movimientos por esa diferencia."}
          </p>
        </>
      )}

      {totalResumen.dolares !== null && (
        <p className="mt-2 opacity-50">
          El resumen también debita {formatearUSD(totalResumen.dolares)}. Los
          consumos en dólares no se importan; cargalos a mano si los querés.
        </p>
      )}
    </div>
  );
}
