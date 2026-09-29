"use client";

import { useId, useState, useTransition } from "react";
import { eliminarMeta, guardarMeta } from "@/app/actions/metas";
import {
  formatearARS,
  formatearARSConSigno,
  formatearFechaNumerica,
  nombreMes,
} from "@/lib/formato";
import {
  mesesEntre,
  type CampoMeta,
  type EntradaMeta,
  type MetaAhorro,
  type ProgresoMeta,
} from "@/lib/metas";
import { CAMPO } from "@/lib/ui";

const ETIQUETA = "text-xs font-medium opacity-70";
const AVISO = "text-amber-700 dark:text-amber-400";

/**
 * La meta de ahorro en el Dashboard: cuánto se juntó (la suma de los balances
 * de cada mes desde que empezó), cuánto falta por mes de acá en adelante, y
 * cuándo se llega si se sigue al ritmo de los últimos meses. Se crea, edita y
 * borra en la misma tarjeta.
 *
 * Siempre se mira desde hoy, no desde el mes elegido en el selector: la meta
 * es una sola y avanza con el tiempo.
 */
export default function MetaAhorroTarjeta({
  meta,
  progreso,
  hoy,
  error,
}: {
  meta: MetaAhorro | null;
  progreso: ProgresoMeta | null;
  /** "YYYY-MM-DD" en hora argentina: default de la fecha de inicio. */
  hoy: string;
  error: string | null;
}) {
  const [editando, setEditando] = useState(false);

  if (error) {
    return (
      <p className="text-sm opacity-60">
        No pudimos leer tu meta. Si todavía no corriste supabase/metas_ahorro.sql,
        corrélo en Supabase y recargá.
      </p>
    );
  }

  if (editando || !meta || !progreso) {
    return editando ? (
      <FormularioMeta meta={meta} hoy={hoy} onListo={() => setEditando(false)} />
    ) : (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm opacity-60">
          Definí cuánto querés juntar y para cuándo, y seguí el avance mes a mes.
        </p>
        <BotonChico onClick={() => setEditando(true)}>Crear meta</BotonChico>
      </div>
    );
  }

  return <VistaMeta meta={meta} p={progreso} onEditar={() => setEditando(true)} />;
}

function VistaMeta({
  meta,
  p,
  onEditar,
}: {
  meta: MetaAhorro;
  p: ProgresoMeta;
  onEditar: () => void;
}) {
  const mesInicio = meta.fecha_inicio.slice(0, 7);
  const mesObjetivo = meta.fecha_objetivo.slice(0, 7);

  return (
    <div className="animar-entrada flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{meta.nombre}</p>
          <p className="text-xs opacity-60">
            {formatearARS(meta.monto_objetivo)} para el{" "}
            {formatearFechaNumerica(meta.fecha_objetivo)}
          </p>
        </div>
        <BotonChico onClick={onEditar}>Editar</BotonChico>
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span
            className={`fuente-display text-2xl font-semibold tabular-nums ${
              p.acumulado < 0 ? "text-egreso" : ""
            }`}
          >
            {formatearARS(p.acumulado)}
          </span>
          <span className="text-sm opacity-60">
            ahorrado de {formatearARS(meta.monto_objetivo)} · {p.porcentaje}%
          </span>
        </p>
        <div
          aria-hidden
          className="h-2 rounded-full"
          style={{ backgroundColor: "var(--viz-grid)" }}
        >
          <div
            className="h-full rounded-full"
            style={{
              width: `${p.porcentaje}%`,
              minWidth: p.acumulado > 0 ? "3px" : 0,
              backgroundColor: "var(--viz-ingreso)",
            }}
          />
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
        <Dato titulo="Falta">
          {p.falta > 0 ? formatearARS(p.falta) : "Nada"}
        </Dato>
        <Dato
          titulo="Por mes, de acá en adelante"
          nota={
            p.mesesRestantes > 0
              ? `${p.mesesRestantes} ${p.mesesRestantes === 1 ? "mes" : "meses"} hasta ${nombreMes(mesObjetivo)}`
              : undefined
          }
        >
          {p.necesarioPorMes !== null
            ? formatearARS(p.necesarioPorMes)
            : p.falta <= 0
              ? "—"
              : "Sin meses"}
        </Dato>
        <Dato
          titulo="Tu ritmo reciente"
          nota={p.ritmo ? `promedio de ${p.ritmo.meses} meses completos` : undefined}
        >
          {p.ritmo ? `${formatearARSConSigno(p.ritmo.promedio)}/mes` : "—"}
        </Dato>
      </dl>

      <TextoProyeccion meta={meta} p={p} />

      <details className="text-xs">
        <summary className="cursor-pointer opacity-60 hover:opacity-100">
          Ver el ahorro mes por mes
        </summary>
        <ul className="mt-2 flex flex-col gap-1">
          {p.balances.map((b) => (
            <li key={b.mes} className="flex justify-between gap-3 tabular-nums">
              <span className="first-letter:uppercase opacity-70">{nombreMes(b.mes)}</span>
              <span className={b.balance < 0 ? "text-egreso" : ""}>
                {formatearARSConSigno(b.balance)}
              </span>
            </li>
          ))}
          {p.balances.length === 0 && (
            <li className="opacity-60">La meta empieza en {nombreMes(mesInicio)}.</li>
          )}
        </ul>
      </details>

      {/* Punto 6: de qué depende que esto sea cierto. */}
      <p className="text-xs opacity-60">
        El ahorro es la suma de ingresos − egresos de cada mes desde{" "}
        {nombreMes(mesInicio)}, y el mes en curso cuenta con lo cargado hasta
        hoy. Sólo es real si registrás todos tus ingresos y gastos, también en
        los meses en que no gastaste todo lo que entró.
      </p>
    </div>
  );
}

/** La frase de la proyección: cuándo se llega a este ritmo, y si a tiempo. */
function TextoProyeccion({ meta, p }: { meta: MetaAhorro; p: ProgresoMeta }) {
  const mesObjetivo = meta.fecha_objetivo.slice(0, 7);
  const pr = p.proyeccion;

  if (pr.tipo === "alcanzada") {
    return <p className="text-sm text-ingreso">Llegaste a la meta.</p>;
  }

  const vencida = p.vencida && (
    <p className={`text-sm ${AVISO}`}>
      La fecha objetivo ya pasó y faltan {formatearARS(p.falta)}. Podés
      cambiarla en Editar.
    </p>
  );

  if (pr.tipo === "sin-datos") {
    return (
      <>
        {vencida}
        <p className="text-sm opacity-70">
          Para proyectar una fecha hacen falta al menos 3 meses completos con
          movimientos cargados (hay {pr.mesesConDatos}).
        </p>
      </>
    );
  }

  if (pr.tipo === "sin-ritmo") {
    return (
      <>
        {vencida}
        <p className={`text-sm ${AVISO}`}>
          En los últimos meses los egresos superaron a los ingresos
          {p.ritmo && ` (${formatearARSConSigno(p.ritmo.promedio)} por mes)`}: a
          ese ritmo no se llega a la meta.
        </p>
      </>
    );
  }

  const diferencia = Math.abs(mesesEntre(mesObjetivo, pr.mes));
  const meses = `${diferencia} ${diferencia === 1 ? "mes" : "meses"}`;

  return (
    <>
      {vencida}
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <EtiquetaEstado estado={pr.estado} />
        <span>
          A este ritmo llegás en {nombreMes(pr.mes)}
          {pr.estado === "adelantado" && `, ${meses} antes de lo previsto`}
          {pr.estado === "a-tiempo" && ", justo para la fecha"}
          {pr.estado === "atrasado" && `, ${meses} después de lo previsto`}.
        </span>
      </p>
    </>
  );
}

function EtiquetaEstado({
  estado,
}: {
  estado: "adelantado" | "a-tiempo" | "atrasado";
}) {
  const texto = { adelantado: "Adelantado", "a-tiempo": "A tiempo", atrasado: "Atrasado" }[
    estado
  ];
  const color =
    estado === "atrasado"
      ? "border-amber-500/50 text-amber-700 dark:text-amber-400"
      : "border-current text-ingreso";
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${color}`}>
      {texto}
    </span>
  );
}

function Dato({
  titulo,
  nota,
  children,
}: {
  titulo: string;
  nota?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs opacity-60">{titulo}</dt>
      <dd className="font-medium tabular-nums">{children}</dd>
      {nota && <dd className="text-xs opacity-60">{nota}</dd>}
    </div>
  );
}

function BotonChico({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 rounded-lg border border-black/15 px-2.5 py-1 text-xs transition-colors hover:bg-black/5 active:scale-[.98] dark:border-white/20 dark:hover:bg-white/10"
    >
      {children}
    </button>
  );
}

/** Un monto guardado como lo muestra el campo: "1500000" o "1234,50". */
function montoComoTexto(monto: number): string {
  return Number.isInteger(monto) ? String(monto) : monto.toFixed(2).replace(".", ",");
}

function FormularioMeta({
  meta,
  hoy,
  onListo,
}: {
  meta: MetaAhorro | null;
  hoy: string;
  onListo: () => void;
}) {
  const uid = useId();
  const id = (campo: string) => `${uid}-${campo}`;
  const [valores, setValores] = useState<EntradaMeta>(() => ({
    nombre: meta?.nombre ?? "",
    monto: meta ? montoComoTexto(meta.monto_objetivo) : "",
    fecha_inicio: meta?.fecha_inicio ?? hoy,
    fecha_objetivo: meta?.fecha_objetivo ?? "",
  }));
  const [errores, setErrores] = useState<Partial<Record<CampoMeta, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [confirmarBorrado, setConfirmarBorrado] = useState(false);
  const [pendiente, iniciar] = useTransition();

  const cambiar = (campo: CampoMeta) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValores((v) => ({ ...v, [campo]: e.target.value }));

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setErrores({});
    iniciar(async () => {
      const r = await guardarMeta(valores);
      if (r.ok) return onListo();
      setErrores(r.errores ?? {});
      setError(r.error ?? null);
    });
  }

  function borrar() {
    setError(null);
    iniciar(async () => {
      const r = await eliminarMeta();
      if (r.ok) return onListo();
      setError(r.error ?? "No se pudo borrar.");
      setConfirmarBorrado(false);
    });
  }

  return (
    <form onSubmit={guardar} className="animar-entrada flex flex-col gap-3">
      <div>
        <label htmlFor={id("nombre")} className={ETIQUETA}>
          Nombre
        </label>
        <input
          id={id("nombre")}
          type="text"
          maxLength={60}
          autoComplete="off"
          placeholder="Vacaciones"
          value={valores.nombre}
          onChange={cambiar("nombre")}
          className={`${CAMPO} mt-1`}
        />
        <ErrorCampo mensaje={errores.nombre} />
      </div>

      <div>
        <label htmlFor={id("monto")} className={ETIQUETA}>
          Cuánto querés juntar
        </label>
        <input
          id={id("monto")}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0,00"
          value={valores.monto}
          onChange={cambiar("monto")}
          className={`${CAMPO} mt-1 tabular-nums`}
        />
        <ErrorCampo mensaje={errores.monto} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={id("inicio")} className={ETIQUETA}>
            Desde
          </label>
          <input
            id={id("inicio")}
            type="date"
            value={valores.fecha_inicio}
            onChange={cambiar("fecha_inicio")}
            className={`${CAMPO} mt-1`}
          />
          <ErrorCampo mensaje={errores.fecha_inicio} />
        </div>
        <div>
          <label htmlFor={id("objetivo")} className={ETIQUETA}>
            Para cuándo
          </label>
          <input
            id={id("objetivo")}
            type="date"
            value={valores.fecha_objetivo}
            onChange={cambiar("fecha_objetivo")}
            className={`${CAMPO} mt-1`}
          />
          <ErrorCampo mensaje={errores.fecha_objetivo} />
        </div>
      </div>
      <p className="-mt-1 text-xs opacity-60">
        Se cuenta el mes de &quot;Desde&quot; entero. Si ya venías ahorrando, poné
        una fecha anterior y esos meses suman.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pendiente}
          className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background transition hover:opacity-90 active:scale-[.99] disabled:opacity-50 disabled:active:scale-100"
        >
          {pendiente ? "Guardando…" : "Guardar meta"}
        </button>
        <button
          type="button"
          onClick={onListo}
          disabled={pendiente}
          className="text-sm underline underline-offset-4 opacity-60 hover:opacity-100 disabled:opacity-30"
        >
          Cancelar
        </button>
        {meta && !confirmarBorrado && (
          <button
            type="button"
            onClick={() => setConfirmarBorrado(true)}
            disabled={pendiente}
            className="ml-auto rounded-lg px-2 py-1 text-xs text-rose-600 transition-colors hover:bg-rose-500/10 disabled:opacity-40 dark:text-rose-400"
          >
            Borrar meta
          </button>
        )}
      </div>

      {confirmarBorrado && (
        <div className="animar-entrada flex flex-wrap items-center gap-2 rounded-lg bg-black/5 px-2.5 py-2 text-xs dark:bg-white/10">
          <span className="flex-1">
            ¿Borrar la meta? Tus transacciones no se tocan.
          </span>
          <button
            type="button"
            onClick={borrar}
            disabled={pendiente}
            className="rounded-lg bg-rose-600 px-2.5 py-1 font-medium text-white transition hover:bg-rose-700 active:scale-95 disabled:opacity-50"
          >
            Sí, borrar
          </button>
          <button
            type="button"
            onClick={() => setConfirmarBorrado(false)}
            className="rounded-lg border border-black/15 px-2.5 py-1 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
          >
            Cancelar
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
    </form>
  );
}

function ErrorCampo({ mensaje }: { mensaje?: string }) {
  if (!mensaje) return null;
  return (
    <p role="alert" className="mt-1 text-xs text-rose-600 dark:text-rose-400">
      {mensaje}
    </p>
  );
}
