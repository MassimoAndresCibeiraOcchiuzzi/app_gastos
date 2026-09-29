import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  traerCategoriasUsuario,
  traerMeta,
  traerPresupuestos,
  traerTransacciones,
} from "@/lib/consultas";
import Encabezado from "@/components/encabezado";
import Navegacion from "@/components/navegacion";
import SelectorMes from "@/components/selector-mes";
import CategoriasMes from "@/components/categorias-mes";
import CuotasComprometidas from "@/components/cuotas-comprometidas";
import MetaAhorroTarjeta from "@/components/meta-ahorro";
import NumeroPrincipal from "@/components/numero-principal";
import PresupuestosMes from "@/components/presupuestos-mes";
import BarrasMeses from "@/components/graficos/barras-meses";
import RepartoCuentas from "@/components/graficos/reparto-cuentas";
import { totalesPorMes } from "@/lib/agregados";
import { CATEGORIAS_CONSUMO } from "@/lib/categorias";
import { filasCategoriasMes, repartoPorCuenta, resumenMes } from "@/lib/dashboard";
import { MESES_CUOTAS, comprasEnCuotas, proyectarCuotas } from "@/lib/cuotas";
import { progresoMeta, rangoParaMeta } from "@/lib/metas";
import { avanceDelMes, progresoPresupuestos } from "@/lib/presupuestos";
import {
  esMesValido,
  etiquetaMesCorta,
  hoyISO,
  mesActual,
  rangoMes,
  sumarMeses,
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
  const [{ transacciones, error }, presupuestos, propias, meta, datosCuotas] =
    await Promise.all([
      traerTransacciones({ desde: `${meses[0]}-01`, hasta: rangoMes(mes).hasta }),
      traerPresupuestos(),
      traerCategoriasUsuario(),
      traerMeta(),
      // Las cuotas se miran desde hoy, como la meta: los últimos 12 meses.
      traerTransacciones({
        desde: `${sumarMeses(mesDeHoy, -(MESES_CUOTAS - 1))}-01`,
        hasta: rangoMes(mesDeHoy).hasta,
      }),
    ]);
  // Con datos incompletos no se proyecta: la tarjeta de cuotas no aparece.
  const cuotas = datosCuotas.error
    ? null
    : proyectarCuotas(comprasEnCuotas(datosCuotas.transacciones), mesDeHoy);

  // La meta se mira siempre desde hoy, no desde el mes elegido: necesita sus
  // propios meses (desde que empezó, y los 6 anteriores para el ritmo).
  const hoy = hoyISO();
  let progreso = null;
  let errorMeta = meta.error;
  if (meta.meta) {
    const datosMeta = await traerTransacciones(rangoParaMeta(meta.meta, mesDeHoy));
    // Con transacciones incompletas el acumulado mentiría: mejor no mostrarlo.
    if (datosMeta.error) errorMeta = datosMeta.error;
    else progreso = progresoMeta(meta.meta, datosMeta.transacciones, hoy);
  }

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

  // Presupuestos: lo gastado de cada tope contra lo que pasó del mes.
  const avance = avanceDelMes(mes, hoy);
  const filasPresupuesto = progresoPresupuestos(
    transacciones,
    mes,
    presupuestos.presupuestos,
    avance,
  );
  const categoriasPresupuestables = [
    ...CATEGORIAS_CONSUMO,
    ...propias.map((c) => c.nombre).sort((a, b) => a.localeCompare(b, "es")),
  ];

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

          {/* Arriba de la torta: en el mes en curso es lo más accionable. */}
          <Tarjeta titulo="Presupuestos">
            <PresupuestosMes
              filas={filasPresupuesto}
              avance={avance}
              esMesEnCurso={esMesEnCurso}
              categorias={categoriasPresupuestables}
              presupuestos={presupuestos.presupuestos}
              error={presupuestos.error}
            />
          </Tarjeta>

          <Tarjeta titulo="Meta de ahorro">
            <MetaAhorroTarjeta
              meta={meta.meta}
              progreso={progreso}
              hoy={hoy}
              error={errorMeta}
            />
          </Tarjeta>

          {cuotas && (
            <Tarjeta titulo="Cuotas comprometidas">
              <CuotasComprometidas proyeccion={cuotas} />
            </Tarjeta>
          )}

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
