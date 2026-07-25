import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { traerCategoriasUsuario } from "@/lib/consultas";
import Encabezado from "@/components/encabezado";
import ImportarPdf from "@/components/importar-pdf";
import Navegacion from "@/components/navegacion";
import { esMesValido, mesActual } from "@/lib/formato";

export const metadata = { title: "Importar resumen" };

export default async function Importar({
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
  // El `mes` de la URL sólo mantiene la navegación coherente entre pestañas.
  // El del resumen arranca siempre en el mes actual, que es cuando se paga.
  const mes = esMesValido(mesPedido) ? mesPedido : mesActual();
  const categoriasUsuario = await traerCategoriasUsuario();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-4 py-8">
      <Encabezado email={user.email} />
      <Navegacion mes={mes} />

      <div>
        <h1 className="text-lg font-semibold">Importar resumen</h1>
        <p className="mt-1 text-sm opacity-60">
          Elegí el mes en que pagás el resumen, subí el PDF y la IA extrae los
          movimientos. Los revisás, corregís lo que haga falta y recién ahí se
          guardan.
        </p>
      </div>

      <ImportarPdf
        mesPorDefecto={mesActual()}
        categoriasIniciales={categoriasUsuario}
      />
    </main>
  );
}
