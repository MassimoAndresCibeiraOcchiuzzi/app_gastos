import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { traerTransacciones } from "@/lib/consultas";
import Encabezado from "@/components/encabezado";
import Navegacion from "@/components/navegacion";
import SelectorMes from "@/components/selector-mes";
import TopCategorias from "@/components/top-categorias";
import BarrasMeses from "@/components/graficos/barras-meses";
import TortaEgresos from "@/components/graficos/torta-egresos";
import {
  agruparCola,
  egresosPorCategoria,
  totalEgresosPorCategoria,
  totalesPorMes,
} from "@/lib/agregados";
import { COLOR_SIN_CATEGORIA, colorDeCategoria } from "@/lib/categorias";
import {
  esMesValido,
  etiquetaMesCorta,
  mesActual,
  rangoMes,
  ultimosMeses,
} from "@/lib/formato";

export const metadata = { title: "Dashboard" };

/** Cuántas porciones tolera la torta antes de agrupar la cola. */
const MAX_PORCIONES = 6;
const MESES_COMPARADOS = 6;

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { mes: mesPedido } = await searchParams;
  const mesDeHoy = mesActual();
  const mes = esMesValido(mesPedido) ? mesPedido : mesDeHoy;

  // Una sola consulta cubre las dos vistas: la torta usa el mes elegido y las
  // barras los 6 meses que terminan en él.
  const meses = ultimosMeses(mes, MESES_COMPARADOS);
  const { transacciones, error } = await traerTransacciones({
    desde: `${meses[0]}-01`,
    hasta: rangoMes(mes).hasta,
  });

  const delMes = transacciones.filter((t) => t.fecha.slice(0, 7) === mes);
  const porCategoria = egresosPorCategoria(delMes);
  // El total de la torta es la suma de sus porciones (consumos), no el egreso
  // total del mes: ese incluye el ajuste de impuestos, que puede ser negativo y
  // no se dibuja. Así los porcentajes suman 100%.
  const totalEgresos = totalEgresosPorCategoria(delMes);

  const porciones = agruparCola(porCategoria, MAX_PORCIONES).visibles.map(
    (c) => ({
      categoria: c.categoria,
      monto: c.monto,
      color: c.esResto ? COLOR_SIN_CATEGORIA : colorDeCategoria(c.categoria),
    }),
  );

  const barras = totalesPorMes(transacciones, meses).map((m) => ({
    ...m,
    etiqueta: etiquetaMesCorta(m.mes),
  }));

  return (
    <main className="viz mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 px-4 py-8">
      <Encabezado email={user.email} />
      <Navegacion mes={mes} />
      <SelectorMes mes={mes} mesDeHoy={mesDeHoy} />

      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-rose-500/30 p-4 text-sm text-rose-600 dark:text-rose-400"
        >
          No pudimos traer los datos: {error}
        </p>
      ) : (
        // items-start: si no, la tarjeta corta del top 3 se estira hasta la
        // altura de la torta y queda medio vacía.
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <Tarjeta titulo="Egresos por categoría">
            <TortaEgresos porciones={porciones} total={totalEgresos} />
          </Tarjeta>

          <Tarjeta titulo="Dónde más gastaste">
            <TopCategorias totales={porCategoria} cantidad={3} />
          </Tarjeta>

          <Tarjeta
            titulo={`Ingresos vs egresos · últimos ${MESES_COMPARADOS} meses`}
            className="lg:col-span-2"
          >
            <BarrasMeses datos={barras} />
          </Tarjeta>
        </div>
      )}
    </main>
  );
}

function Tarjeta({
  titulo,
  children,
  className = "",
}: {
  titulo: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-black/10 p-4 dark:border-white/15 ${className}`}
    >
      <h2 className="mb-3 text-sm font-medium">{titulo}</h2>
      {children}
    </section>
  );
}
