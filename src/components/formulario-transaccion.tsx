"use client";

import { useRef, useState, useTransition } from "react";
import {
  CATEGORIAS_CONSUMO,
  CATEGORIA_POR_DEFECTO,
  CUENTAS_SUGERIDAS,
} from "@/lib/categorias";
import { crearTransaccion } from "@/app/actions/transacciones";
import { ESTADO_INICIAL, type EstadoFormulario } from "@/lib/formulario";

const INPUT =
  "w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/50";
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
 * La página lo monta con `key={mes}`, así que al cambiar de mes se rearma solo
 * con la fecha sugerida nueva.
 */
export default function FormularioTransaccion({
  fechaPorDefecto,
  cuentasConocidas,
}: {
  fechaPorDefecto: string;
  cuentasConocidas: string[];
}) {
  const [estado, setEstado] = useState<EstadoFormulario>(ESTADO_INICIAL);
  const [pendiente, iniciarEnvio] = useTransition();
  // Campos controlados a propósito: si el server devuelve un error de
  // validación, lo que escribiste tiene que seguir ahí.
  const [valores, setValores] = useState(() => valoresVacios(fechaPorDefecto));
  const montoRef = useRef<HTMLInputElement>(null);

  // Va por onSubmit y no por `action={...}`: con el prop `action` React
  // resetea el <form> del DOM al terminar, y el select y los radios vuelven
  // a su valor por defecto aunque el estado diga otra cosa.
  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const datos = new FormData(e.currentTarget);

    iniciarEnvio(async () => {
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
      className="flex flex-col gap-3 rounded-xl border border-black/10 p-4 dark:border-white/15"
    >
      <h2 className="text-sm font-medium">Nueva transacción</h2>

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
          <label htmlFor="monto" className={ETIQUETA}>
            Monto
          </label>
          <input
            ref={montoRef}
            id="monto"
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
          <label htmlFor="fecha" className={ETIQUETA}>
            Fecha
          </label>
          <input
            id="fecha"
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
        <label htmlFor="descripcion" className={ETIQUETA}>
          Descripción
        </label>
        <input
          id="descripcion"
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
          <label htmlFor="categoria" className={ETIQUETA}>
            Categoría
          </label>
          <select
            id="categoria"
            name="categoria"
            value={valores.categoria}
            onChange={cambiar("categoria")}
            className={`${INPUT} mt-1`}
          >
            {CATEGORIAS_CONSUMO.map((categoria) => (
              <option key={categoria} value={categoria}>
                {categoria}
              </option>
            ))}
          </select>
          <Error mensaje={estado.errores?.categoria} />
        </div>

        <div>
          <label htmlFor="cuenta" className={ETIQUETA}>
            Cuenta
          </label>
          <input
            id="cuenta"
            name="cuenta"
            type="text"
            list="cuentas-conocidas"
            maxLength={60}
            autoComplete="off"
            placeholder="Efectivo"
            value={valores.cuenta}
            onChange={cambiar("cuenta")}
            className={`${INPUT} mt-1`}
          />
          <datalist id="cuentas-conocidas">
            {sugerencias.map((cuenta) => (
              <option key={cuenta} value={cuenta} />
            ))}
          </datalist>
          <Error mensaje={estado.errores?.cuenta} />
        </div>
      </div>

      <button
        type="submit"
        disabled={pendiente}
        className="mt-1 rounded-lg bg-foreground px-4 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pendiente ? "Guardando…" : "Guardar"}
      </button>

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
