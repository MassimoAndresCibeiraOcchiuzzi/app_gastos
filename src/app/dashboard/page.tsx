import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { traerTransacciones } from "@/lib/consultas";
import Encabezado from "@/components/encabezado";
import Navegacion from "@/components/navegacion";
import SelectorMes from "@/components/selector-mes";
import CategoriasMes from "@/components/categorias-mes";
import NumeroPrincipal from "@/components/numero-principal";
import BarrasMeses from "@/components/graficos/barras-meses";
import RepartoCuentas from "@/components/graficos/reparto-cuentas";
import { totalesPorMes } from "@/lib/agregados";
import { filasCategoriasMes, repartoPorCuenta, resumenMes } from "@/lib/dashboard";
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

  // Una sola consulta cubre todo: la torta y la lista usan el mes elegido, y
  // las barras, las comparaciones y el mini gráfico de cada categoría, los 6
  // meses que terminan en él.
  const meses = ultimosMeses(mes, MESES_COMPARADOS);
  const { transacciones, error } = await traerTransacciones({
    desde: `${meses[0]}-01`,
    hasta: rangoMes(mes).hasta,
  });

  // Filas de la lista (= porciones de la torta), con su comparación y su
  // detalle ya armados. El total es la suma de las porciones (consumos), no el
  // egreso total del mes: ese incluye el ajuste de impuestos, que puede ser
  // negativo y no se dibuja. Así los porcentajes suman 100%.
  const { filas, total: totalEgresos } = filasCategoriasMes(
    transacciones,
    mes,
    meses,
    MAX_PORCIONES,
  );

  const esMesEnCurso = mes === mesDeHoy;
  const resumen = resumenMes(transacciones, mes, esMesEnCurso);
  const { segmentos: porCuenta } = repartoPorCuenta(transacciones, mes);

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
        <div className="flex flex-col gap-4">
          <NumeroPrincipal resumen={resumen} mes={mes} esMesEnCurso={esMesEnCurso} />

          <Tarjeta titulo="Egresos por categoría">
            <CategoriasMes
              filas={filas}
              total={totalEgresos}
              esMesEnCurso={esMesEnCurso}
            />
          </Tarjeta>

          <Tarjeta titulo="Egresos por medio de pago">
            <RepartoCuentas segmentos={porCuenta} />
          </Tarjeta>

          <Tarjeta
            titulo={`Ingresos vs egresos · últimos ${MESES_COMPARADOS} meses`}
          >
            <BarrasMeses datos={barras} mesSeleccionado={mes} />
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
