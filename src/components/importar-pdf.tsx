"use client";

import { useRef, useState, useTransition } from "react";
import { importarTransacciones } from "@/app/actions/transacciones";
import { CATEGORIA_AJUSTES, CUENTA_IMPORTACION } from "@/lib/categorias";
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
  parsearMonto,
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
import { admiteFijo, type PedidoFijo } from "@/lib/fijos";
import { claveComercio, type PedidoRegla } from "@/lib/reglas";
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
   * La categoría con la que llegó (de la IA o de una regla). Si la cambiás, se
   * ofrece recordarla para ese comercio.
   */
  categoriaInicial: string;
  /** Si la categoría inicial salió de una regla tuya, su patrón. */
  regla?: string;
  /** Recordar la categoría corregida para este comercio (tildado de entrada). */
  recordar: boolean;
  /** Casilla "Gasto fijo" de la fila. */
  fijo: boolean;
  /**
   * Con qué llegó la casilla: tildada si el comercio se marcó como fijo
   * antes. Si la cambiás, se aprende; si no, no se toca nada.
   */
  fijoSugerido: boolean;
  /**
   * El ajuste neteado de impuestos. No es un consumo: su tipo queda fijo en
   * egreso y su monto puede ser negativo (más devoluciones que percepciones).
   */
  esAjuste?: boolean;
  /**
   * Si el filtro automático la sacó, la palabra que coincidió. Se muestra
   * destildada, al final, para re-incluirla si el filtro se equivocó.
   */
  motivoDescarte?: string;
};

type Estado =
  | "vacio"
  | "analizando"
  /** El servidor avisó que este mismo PDF ya se importó: espera confirmación. */
  | "duplicado"
  | "revisando"
  | "guardando"
  | "listo";

/**
 * Lo que se guarda es el mes en que pagás el resumen, no la fecha de compra:
 * una cuota 3 de 6 se compró hace meses pero la plata sale ahora. La fecha
 * original queda a la vista como referencia.
 *
 * El resto de la traducción (monto positivo, egreso salvo devoluciones, la
 * categoría por rubro que sugirió la IA) vive en `aCamposGuardables`, que es
 * donde se testea.
 */
function aFila(item: ItemExtraido, id: number, fechaImputacion: string): Fila {
  const campos = aCamposGuardables(item);
  return {
    id,
    incluir: true,
    fecha: fechaImputacion,
    fechaOriginal: item.fecha,
    fechaEditada: false,
    ...campos,
    categoriaInicial: campos.categoria,
    regla: item.regla,
    recordar: true,
    fijo: item.esFijo === true,
    fijoSugerido: item.esFijo === true,
  };
}

/**
 * ¿Hay que ofrecer recordar la categoría de esta fila? Sólo si la cambiaste,
 * no es el ajuste de impuestos y la descripción tiene un comercio
 * reconocible. Devuelve el patrón que se guardaría, o null.
 */
function patronParaRecordar(fila: Fila): string | null {
  if (fila.esAjuste || fila.categoria === fila.categoriaInicial) return null;
  return claveComercio(fila.descripcion);
}

/** Una línea descartada por el filtro: misma fila, pero destildada. */
function aFilaDescartada(
  item: Descartado,
  id: number,
  fechaImputacion: string,
): Fila {
  return {
    ...aFila(item, id, fechaImputacion),
    incluir: false,
    motivoDescarte: item.motivo,
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
    categoriaInicial: CATEGORIA_AJUSTES,
    recordar: false,
    fijo: false,
    fijoSugerido: false,
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
  const [avisoDuplicado, setAvisoDuplicado] = useState<string | null>(null);
  /** SHA-256 del PDF analizado; se registra al confirmar la importación. */
  const [hash, setHash] = useState<string | null>(null);
  const [ajuste, setAjuste] = useState<Ajuste | null>(null);
  const [metodo, setMetodo] = useState<Metodo>("texto");
  const [totalResumen, setTotalResumen] = useState<TotalResumen>(TOTAL_VACIO);
  const [mesResumen, setMesResumen] = useState(mesPorDefecto);
  // Arranca en "Tarjeta": es el medio de pago del resumen. El rubro va en la
  // categoría de cada fila. Se puede cambiar (p. ej. "Visa", "Mastercard").
  const [cuenta, setCuenta] = useState(CUENTA_IMPORTACION);
  // Default destildado: no importar impuestos, que es el comportamiento base.
  const [incluirImpuestos, setIncluirImpuestos] = useState(false);
  const [importadas, setImportadas] = useState(0);
  const [reglasGuardadas, setReglasGuardadas] = useState(0);
  const [, iniciar] = useTransition();
  const archivoRef = useRef<HTMLInputElement>(null);

  const incluidas = filas.filter((f) => f.incluir);
  const principales = filas.filter((f) => !f.motivoDescarte);
  const descartadas = filas.filter((f) => f.motivoDescarte);
  const mesOk = esMesValido(mesResumen);
  // Mientras se analiza o se espera la respuesta al aviso de duplicado, el
  // formulario queda quieto: el archivo elegido es el que se va a reenviar.
  const formBloqueado = estado === "analizando" || estado === "duplicado";

  function analizar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    enviarPdf(false);
  }

  /**
   * Manda el PDF a analizar. `confirmarDuplicado` va en true cuando el
   * usuario ya vio el aviso de "este resumen ya fue importado" y eligió
   * seguir igual.
   */
  async function enviarPdf(confirmarDuplicado: boolean) {
    const archivo = archivoRef.current?.files?.[0];
    if (!archivo) return;

    if (!mesOk) {
      setError("Elegí el mes del resumen.");
      return;
    }

    setEstado("analizando");
    setError(null);
    setAvisoDuplicado(null);

    const datos = new FormData();
    datos.append("archivo", archivo);
    datos.append("incluirImpuestos", String(incluirImpuestos));
    datos.append("confirmarDuplicado", String(confirmarDuplicado));

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

      // Este mismo archivo ya se importó: no es un error, es una pregunta.
      if (respuesta.status === 409 && cuerpo?.duplicado) {
        setAvisoDuplicado(
          typeof cuerpo.error === "string"
            ? cuerpo.error
            : "Este resumen ya fue importado antes. ¿Querés continuar igual?",
        );
        setEstado("duplicado");
        return;
      }

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

      const descartadosResp = (cuerpo?.descartados ?? []) as Descartado[];

      // Consumos primero, después el ajuste de impuestos, y al final lo que
      // descartó el filtro (destildado).
      const nuevas = items.map((item, i) => aFila(item, i, imputacion));
      if (ajusteResp) {
        nuevas.push(aFilaAjuste(ajusteResp, nuevas.length, imputacion));
      }
      for (const d of descartadosResp) {
        nuevas.push(aFilaDescartada(d, nuevas.length, imputacion));
      }
      setFilas(nuevas);
      setAjuste(ajusteResp);
      setHash(typeof cuerpo?.hash === "string" ? cuerpo.hash : null);
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

  /**
   * "Marcar todas" no toca las descartadas: ahí hay saldos y pagos, que no
   * deben entrar de a montón. Esas se tildan de a una. Desmarcar sí es todas.
   */
  function marcarTodas(incluir: boolean) {
    setFilas((fs) =>
      fs.map((f) => (incluir && f.motivoDescarte ? f : { ...f, incluir })),
    );
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
      // El monto es siempre el del resumen: la marca de fijo no lo toca.
      es_fijo: f.fijo && admiteFijo(f.tipo, f.categoria),
      // Si el monto puede ser negativo lo decide el servidor, por categoría y
      // tipo (ver `admiteMontoNegativo`): el ajuste ya viaja como egreso de
      // "Ajustes tarjeta".
    }));

    // Las categorías corregidas que pediste recordar, sólo de filas que se
    // importan. El patrón lo calcula el servidor de nuevo: acá va la
    // descripción tal cual.
    const reglas: PedidoRegla[] = incluidas
      .filter((f) => f.recordar && patronParaRecordar(f) !== null)
      .map((f) => ({ descripcion: f.descripcion, categoria: f.categoria }));

    // Las casillas "Gasto fijo" que cambiaste respecto de lo sugerido: se
    // aprenden (tildar recuerda el comercio, destildar lo olvida).
    const fijos: PedidoFijo[] = incluidas
      .filter((f) => admiteFijo(f.tipo, f.categoria) && f.fijo !== f.fijoSugerido)
      .map((f) => ({ descripcion: f.descripcion, fijo: f.fijo }));

    iniciar(async () => {
      const resultado = await importarTransacciones(
        entradas,
        hash ?? undefined,
        reglas,
        fijos,
      );
      if (!resultado.ok) {
        setError(resultado.error);
        setEstado("revisando");
        return;
      }
      setImportadas(resultado.importadas);
      setReglasGuardadas(resultado.reglasGuardadas);
      setFilas([]);
      setEstado("listo");
    });
  }

  function empezarDeNuevo() {
    if (archivoRef.current) archivoRef.current.value = "";
    setFilas([]);
    setAjuste(null);
    setHash(null);
    setAvisoDuplicado(null);
    setTotalResumen(TOTAL_VACIO);
    setCuenta(CUENTA_IMPORTACION);
    setError(null);
    setEstado("vacio");
  }

  /** Una fila de la revisión. La usan la lista principal y la de descartadas. */
  function renderFila(fila: Fila) {
    const patron = patronParaRecordar(fila);
    return (
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
          {fila.regla && fila.categoria === fila.categoriaInicial && (
            <span>{` · categoría por tu regla “${fila.regla}”`}</span>
          )}
          {fila.motivoDescarte && (
            <span className="text-amber-700 dark:text-amber-400">
              {` · descartada: coincide con “${fila.motivoDescarte}”`}
            </span>
          )}
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

        {!fila.esAjuste && admiteFijo(fila.tipo, fila.categoria) && (
          <label className="mt-1.5 ml-[26px] flex cursor-pointer items-start gap-2 text-xs">
            <input
              type="checkbox"
              checked={fila.fijo}
              onChange={(e) => editar(fila.id, "fijo", e.target.checked)}
              aria-label={`Gasto fijo: ${fila.descripcion || "esta fila"}`}
              className="mt-px h-3.5 w-3.5 shrink-0 accent-current"
            />
            <span>
              Gasto fijo
              {fila.fijoSugerido && fila.fijo && (
                <span className="opacity-60"> (lo marcaste como fijo antes)</span>
              )}
            </span>
          </label>
        )}

        {patron && (
          <label className="animar-entrada mt-1.5 ml-[26px] flex cursor-pointer items-start gap-2 text-xs">
            <input
              type="checkbox"
              checked={fila.recordar}
              onChange={(e) => editar(fila.id, "recordar", e.target.checked)}
              className="mt-px h-3.5 w-3.5 shrink-0 accent-current"
            />
            <span>
              Aplicar siempre a este comercio{" "}
              <span className="opacity-60">
                (lo de “{patron}” → {fila.categoria})
              </span>
            </span>
          </label>
        )}
      </li>
    );
  }

  if (estado === "listo") {
    return (
      <div className="rounded-xl border border-black/10 p-6 text-center dark:border-white/15">
        <p className="text-sm">
          Listo: importamos <strong>{importadas}</strong>{" "}
          {importadas === 1 ? "transacción" : "transacciones"} a{" "}
          <span className="first-letter:uppercase">{nombreMes(mesResumen)}</span>.
        </p>
        {reglasGuardadas > 0 && (
          <p className="mt-1 text-xs opacity-60">
            Y recordamos {reglasGuardadas}{" "}
            {reglasGuardadas === 1 ? "comercio" : "comercios"} para el próximo
            resumen. Las reglas se ven y se borran en Movimientos → Categorías.
          </p>
        )}
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
      {(estado === "vacio" || formBloqueado) && (
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
              disabled={formBloqueado}
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
              disabled={formBloqueado}
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
              disabled={formBloqueado}
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
            disabled={formBloqueado}
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

      {estado === "duplicado" && avisoDuplicado && (
        <div
          role="alertdialog"
          aria-labelledby="aviso-duplicado"
          className="flex flex-col gap-3 rounded-xl border border-amber-500/50 bg-amber-500/5 p-4 text-sm"
        >
          <p id="aviso-duplicado" className="font-medium text-amber-800 dark:text-amber-300">
            {avisoDuplicado}
          </p>
          <p className="text-xs opacity-70">
            Si seguís, se van a cargar de nuevo todos sus movimientos y podés
            terminar con gastos duplicados. Sólo tiene sentido si borraste la
            importación anterior.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => enviarPdf(true)}
              className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background transition hover:opacity-90 active:scale-[.99]"
            >
              Continuar igual
            </button>
            <button
              type="button"
              autoFocus
              onClick={empezarDeNuevo}
              className="rounded-lg border border-black/15 px-4 py-2 text-sm hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
            >
              Cancelar
            </button>
          </div>
        </div>
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
                {principales.length}{" "}
                {principales.length === 1 ? "movimiento" : "movimientos"}{" "}
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

          <ul className="flex flex-col gap-3">
            {principales.map(renderFila)}
          </ul>

          {descartadas.length > 0 && (
            <section
              aria-labelledby="titulo-descartadas"
              className="flex flex-col gap-3"
            >
              <div>
                <h3 id="titulo-descartadas" className="text-sm font-medium">
                  Descartadas automáticamente ({descartadas.length})
                </h3>
                <p className="mt-0.5 text-xs opacity-60">
                  El filtro las tomó por saldos, pagos o{" "}
                  {incluirImpuestos ? "totales" : "impuestos y percepciones"} y
                  no se importan. Si alguna es un consumo de verdad, tildala y
                  corregí lo que haga falta. &quot;Marcar todas&quot; no las
                  incluye.
                </p>
              </div>
              <ul className="flex flex-col gap-3">
                {descartadas.map(renderFila)}
              </ul>
            </section>
          )}

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

/**
 * Suma con signo de las filas. Parsea cada monto con `parsearMonto`, la misma
 * función que usa el servidor al guardar: si no, "1.234,56" escrito a mano se
 * leía distinto acá y allá, y el checksum no decía la verdad. Un monto que no
 * se puede leer suma 0 (el servidor lo va a rechazar al confirmar).
 */
function neto(filas: Fila[]): number {
  const total = filas.reduce((acc, f) => {
    const monto = parsearMonto(f.monto) ?? 0;
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
