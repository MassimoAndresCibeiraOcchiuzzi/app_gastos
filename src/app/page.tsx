import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  traerCategoriasUsuario,
  traerReglas,
  traerTransacciones,
} from "@/lib/consultas";
import BotonExportar from "@/components/boton-exportar";
import Encabezado from "@/components/encabezado";
import PanelAlta from "@/components/panel-alta";
import ProveedorMovimientos from "@/components/proveedor-movimientos";
import ListaTransacciones from "@/components/lista-transacciones";
import Navegacion from "@/components/navegacion";
import ResumenMes from "@/components/resumen-mes";
import SelectorMes from "@/components/selector-mes";
import { totalPorTipo } from "@/lib/agregados";
import { esMesValido, hoyISO, mesActual, rangoMes } from "@/lib/formato";

export default async function Home({
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
  const { desde, hasta } = rangoMes(mes);

  const [{ transacciones, error }, categoriasUsuario, reglas] = await Promise.all([
    traerTransacciones({ desde, hasta }),
    traerCategoriasUsuario(),
    traerReglas(),
  ]);

  const ingresos = totalPorTipo(transacciones, "ingreso");
  const egresos = totalPorTipo(transacciones, "egreso");

  const cuentasConocidas = Array.from(
    new Set(transacciones.map((t) => t.cuenta).filter((c): c is string => !!c)),
  );

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-5 px-4 py-8">
      <Encabezado email={user.email} />
      <Navegacion mes={mes} />
      <SelectorMes mes={mes} mesDeHoy={mesDeHoy} />

      {/* Con error, las filas pueden estar incompletas: mejor sin totales
          que con unos que parecen buenos. El aviso va abajo, en la lista. */}
      {!error && <ResumenMes ingresos={ingresos} egresos={egresos} />}

      {/* El proveedor comparte las categorías entre el alta, el gestor y la
          edición de cada fila de la lista. */}
      <ProveedorMovimientos
        categoriasIniciales={categoriasUsuario}
        cuentasConocidas={cuentasConocidas}
        reglas={reglas}
      >
        <PanelAlta fechaPorDefecto={mes === mesDeHoy ? hoyISO() : desde} />

        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium">Movimientos del mes</h2>
          {/* Exporta todo el historial, no sólo el mes que estás viendo. */}
          <BotonExportar />
        </div>

        {error ? (
          <p
            role="alert"
            className="rounded-xl border border-rose-500/30 p-4 text-sm text-rose-600 dark:text-rose-400"
          >
            No pudimos traer las transacciones: {error}
          </p>
        ) : (
          <ListaTransacciones transacciones={transacciones} />
        )}
      </ProveedorMovimientos>
    </main>
  );
}
