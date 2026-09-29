"use client";

import { useId, useRef, useState, useTransition } from "react";
import {
  CATEGORIA_AJUSTES,
  CATEGORIA_POR_DEFECTO,
  CUENTAS_SUGERIDAS,
} from "@/lib/categorias";
import {
  crearTransaccion,
  editarTransaccion,
} from "@/app/actions/transacciones";
import { ESTADO_INICIAL, type EstadoFormulario } from "@/lib/formulario";
import { claveComercio } from "@/lib/reglas";
import type { Transaccion } from "@/lib/types";
import SelectorCategoria from "@/components/selector-categoria";
import { useMovimientos } from "@/components/proveedor-movimientos";
import { CAMPO } from "@/lib/ui";

const INPUT = CAMPO;
const ETIQUETA = "text-xs font-medium opacity-70";

type Valores = {
  tipo: "ingreso" | "egreso";
  monto: string;
  fecha: string;
  descripcion: string;
  categoria: string;
  cuenta: string;
};

const valoresVacios = (fecha: string): Valores => ({
  tipo: "egreso",
  monto: "",
  fecha,
  descripcion: "",
  categoria: CATEGORIA_POR_DEFECTO,
  cuenta: "",
});

/**
 * Los valores de una transacción guardada, como los muestra el formulario. El
 * monto va con coma decimal ("1234,50"), que `parsearMonto` lee sin
 * ambigüedad; el ajuste de impuestos puede traerlo negativo.
 */
const valoresDe = (t: Transaccion): Valores => ({
  tipo: t.tipo,
  monto: t.monto.toFixed(2).replace(".", ","),
  fecha: t.fecha,
  descripcion: t.descripcion,
  categoria: t.categoria ?? CATEGORIA_POR_DEFECTO,
  cuenta: t.cuenta ?? "",
});

/**
 * Alta y edición de una transacción: es el mismo formulario.
 *
 * - Alta (sin `transaccion`): la página lo monta con `key={mes}`, así que al
 *   cambiar de mes se rearma solo con la fecha sugerida nueva.
 * - Edición (con `transaccion`): arranca con sus datos y guarda con
 *   `editarTransaccion`. Si cambiás la categoría, ofrece recordarla para ese
 *   comercio en los próximos imports.
 */
export default function FormularioTransaccion({
  fechaPorDefecto = "",
  transaccion,
  onGuardado,
}: {
  fechaPorDefecto?: string;
  transaccion?: Transaccion;
  /** Edición: se llama cuando se guardó bien (p. ej. para cerrar el modal). */
  onGuardado?: () => void;
}) {
  const { nombres: categorias, crear: onCrearCategoria, cuentasConocidas } =
    useMovimientos();
  const editando = transaccion !== undefined;
  // Los ids tienen que ser únicos en la página: el formulario de alta y el de
  // edición (en el modal) conviven.
  const uid = useId();
  const idDe = (campo: string) => `${uid}-${campo}`;

  const [estado, setEstado] = useState<EstadoFormulario>(ESTADO_INICIAL);
  const [pendiente, iniciarEnvio] = useTransition();
  // Campos controlados a propósito: si el server devuelve un error de
  // validación, lo que escribiste tiene que seguir ahí.
  const [valores, setValores] = useState(() =>
    transaccion ? valoresDe(transaccion) : valoresVacios(fechaPorDefecto),
  );
  // Tildado de entrada: si corregiste la categoría, lo más probable es que
  // quieras lo mismo la próxima vez. Se puede destildar.
  const [recordar, setRecordar] = useState(true);
  const montoRef = useRef<HTMLInputElement>(null);

  // La regla se ofrece sólo si cambiaste la categoría, la descripción tiene un
  // comercio reconocible y no es el ajuste de impuestos.
  const patron = claveComercio(valores.descripcion);
  const ofrecerRegla =
    editando &&
    // Contra la categoría con la que arrancó el form (una fila vieja sin
    // categoría arranca en "Otros"), no contra el null de la base.
    valores.categoria !== (transaccion.categoria ?? CATEGORIA_POR_DEFECTO) &&
    valores.categoria !== CATEGORIA_AJUSTES &&
    patron !== null;

  // Va por onSubmit y no por `action={...}`: con el prop `action` React
  // resetea el <form> del DOM al terminar, y el select y los radios vuelven
  // a su valor por defecto aunque el estado diga otra cosa.
  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const datos = new FormData(e.currentTarget);

    iniciarEnvio(async () => {
      if (editando) {
        const resultado = await editarTransaccion(transaccion.id, datos);
        setEstado(resultado);
        // Con aviso (se guardó, pero la regla no) el modal queda abierto
        // para que se lea.
        if (resultado.ok && !resultado.aviso) onGuardado?.();
        return;
      }

      const resultado = await crearTransaccion(datos);
      setEstado(resultado);
      if (resultado.ok) {
        setValores(valoresVacios(fechaPorDefecto));
        montoRef.current?.focus();
      }
    });
  }

  const cambiar =
    <C extends keyof Valores>(campo: C) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setValores((v) => ({ ...v, [campo]: e.target.value as Valores[C] }));

  const sugerencias = Array.from(
    new Set([...cuentasConocidas, ...CUENTAS_SUGERIDAS]),
  );

  return (
    <form
      onSubmit={enviar}
      className={`flex flex-col gap-3 ${
        editando ? "" : "rounded-xl border border-black/10 p-4 dark:border-white/15"
      }`}
    >
      {/* En edición el título lo pone el modal, junto a su botón de cerrar. */}
      {!editando && <h2 className="text-sm font-medium">Nueva transacción</h2>}

      <fieldset className="grid grid-cols-2 gap-2">
        <legend className="sr-only">Tipo</legend>
        <OpcionTipo
          valor="egreso"
          etiqueta="Egreso"
          elegido={valores.tipo === "egreso"}
          onChange={cambiar("tipo")}
        />
        <OpcionTipo
          valor="ingreso"
          etiqueta="Ingreso"
          elegido={valores.tipo === "ingreso"}
          onChange={cambiar("tipo")}
        />
      </fieldset>
      <Error mensaje={estado.errores?.tipo} />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={idDe("monto")} className={ETIQUETA}>
            Monto
          </label>
          <input
            ref={montoRef}
            id={idDe("monto")}
            name="monto"
            type="text"
            inputMode="decimal"
            required
            autoComplete="off"
            placeholder="0,00"
            value={valores.monto}
            onChange={cambiar("monto")}
            className={`${INPUT} mt-1 tabular-nums`}
          />
          <Error mensaje={estado.errores?.monto} />
        </div>

        <div>
          <label htmlFor={idDe("fecha")} className={ETIQUETA}>
            Fecha
          </label>
          <input
            id={idDe("fecha")}
            name="fecha"
            type="date"
            required
            value={valores.fecha}
            onChange={cambiar("fecha")}
            className={`${INPUT} mt-1`}
          />
          <Error mensaje={estado.errores?.fecha} />
        </div>
      </div>

      <div>
        <label htmlFor={idDe("descripcion")} className={ETIQUETA}>
          Descripción
        </label>
        <input
          id={idDe("descripcion")}
          name="descripcion"
          type="text"
          required
          maxLength={200}
          autoComplete="off"
          placeholder="Verdulería"
          value={valores.descripcion}
          onChange={cambiar("descripcion")}
          className={`${INPUT} mt-1`}
        />
        <Error mensaje={estado.errores?.descripcion} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={idDe("categoria")} className={ETIQUETA}>
            Categoría
          </label>
          {/* SelectorCategoria no expone un <select name>, así que el valor
              viaja en este hidden para que lo tome el FormData del form. */}
          <input type="hidden" name="categoria" value={valores.categoria} />
          <SelectorCategoria
            id={idDe("categoria")}
            value={valores.categoria}
            categorias={categorias}
            onChange={(c) => setValores((v) => ({ ...v, categoria: c }))}
            onCrear={onCrearCategoria}
            className="mt-1"
          />
          <Error mensaje={estado.errores?.categoria} />
        </div>

        <div>
          <label htmlFor={idDe("cuenta")} className={ETIQUETA}>
            Cuenta
          </label>
          <input
            id={idDe("cuenta")}
            name="cuenta"
            type="text"
            list={idDe("cuentas")}
            maxLength={60}
            autoComplete="off"
            placeholder="Efectivo"
            value={valores.cuenta}
            onChange={cambiar("cuenta")}
            className={`${INPUT} mt-1`}
          />
          <datalist id={idDe("cuentas")}>
            {sugerencias.map((cuenta) => (
              <option key={cuenta} value={cuenta} />
            ))}
          </datalist>
          <Error mensaje={estado.errores?.cuenta} />
        </div>
      </div>

      {ofrecerRegla && (
        <label className="animar-entrada flex cursor-pointer items-start gap-2.5 rounded-lg bg-black/5 px-3 py-2 dark:bg-white/10">
          <input
            type="checkbox"
            name="recordar"
            checked={recordar}
            onChange={(e) => setRecordar(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-current"
          />
          <span className="text-sm">
            Aplicar siempre a este comercio
            <span className="block text-xs opacity-60">
              Los próximos resúmenes que importes van a poner lo de “{patron}”
              en {valores.categoria}.
            </span>
          </span>
        </label>
      )}

      <button
        type="submit"
        disabled={pendiente}
        className="mt-1 rounded-lg bg-foreground px-4 py-2.5 text-sm font-medium text-background transition hover:opacity-90 active:scale-[.99] disabled:opacity-50 disabled:active:scale-100"
      >
        {pendiente ? "Guardando…" : editando ? "Guardar cambios" : "Guardar"}
      </button>

      {estado.aviso && (
        <p role="status" className="text-sm text-amber-700 dark:text-amber-400">
          {estado.aviso}
        </p>
      )}

      {estado.error && (
        <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">
          {estado.error}
        </p>
      )}

      <p aria-live="polite" className="sr-only">
        {estado.ok ? "Transacción guardada." : ""}
      </p>
    </form>
  );
}

function OpcionTipo({
  valor,
  etiqueta,
  elegido,
  onChange,
}: {
  valor: string;
  etiqueta: string;
  elegido: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <label className="cursor-pointer">
      <input
        type="radio"
        name="tipo"
        value={valor}
        checked={elegido}
        onChange={onChange}
        className="peer sr-only"
      />
      <span className="block rounded-lg border border-black/15 py-2 text-center text-sm transition-colors peer-checked:border-transparent peer-checked:bg-foreground peer-checked:text-background peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500 dark:border-white/20">
        {etiqueta}
      </span>
    </label>
  );
}

function Error({ mensaje }: { mensaje?: string }) {
  if (!mensaje) return null;
  return (
    <p role="alert" className="mt-1 text-xs text-rose-600 dark:text-rose-400">
      {mensaje}
    </p>
  );
}
