import { formatearARS } from "@/lib/formato";

export default function ResumenMes({
  ingresos,
  egresos,
}: {
  ingresos: number;
  egresos: number;
}) {
  const balance = ingresos - egresos;

  return (
    <section
      aria-label="Resumen del mes"
      className="grid grid-cols-2 gap-3 sm:grid-cols-3"
    >
      <Tarjeta
        etiqueta="Ingresos"
        valor={formatearARS(ingresos)}
        clase="text-ingreso"
      />
      <Tarjeta
        etiqueta="Egresos"
        valor={formatearARS(egresos)}
        clase="text-egreso"
      />
      <Tarjeta
        etiqueta="Balance"
        valor={formatearARS(balance)}
        clase={balance < 0 ? "text-egreso" : "text-ingreso"}
        destacada
      />
    </section>
  );
}

function Tarjeta({
  etiqueta,
  valor,
  clase,
  destacada = false,
}: {
  etiqueta: string;
  valor: string;
  clase: string;
  destacada?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border border-black/10 p-3 dark:border-white/15 ${
        destacada ? "col-span-2 sm:col-span-1" : ""
      }`}
    >
      <div className="text-xs opacity-60">{etiqueta}</div>
      <div
        className={`fuente-display mt-1 text-lg font-semibold tabular-nums ${clase}`}
      >
        {valor}
      </div>
    </div>
  );
}
