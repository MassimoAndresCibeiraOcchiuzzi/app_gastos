import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { traerTransacciones } from "@/lib/consultas";
import {
  nombreArchivoExport,
  nombreArchivoExportMes,
  transaccionesACSV,
} from "@/lib/csv";
import { esMesValido, hoyISO, rangoMes } from "@/lib/formato";

/** Sin esto Excel abre el archivo en ANSI y rompe los acentos y la ñ. */
const BOM = "﻿";

/**
 * Descarga en CSV las transacciones del usuario logueado.
 *
 * - `?mes=YYYY-MM`: sólo ese mes. Archivo "gastos_septiembre_2026.csv".
 * - sin `mes`: todo el historial. Archivo "gastos_<fecha de hoy>.csv".
 *
 * Un `mes` que no es válido da 400: exportar todo en su lugar sería
 * sorprender con un archivo que no se pidió.
 *
 * RLS ya limita las filas a las propias, pero igual chequeamos sesión para
 * devolver un 401 claro en vez de un archivo vacío.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No hay sesión." }, { status: 401 });
  }

  const mes = request.nextUrl.searchParams.get("mes");
  if (mes !== null && !esMesValido(mes)) {
    return NextResponse.json({ error: "Mes inválido." }, { status: 400 });
  }

  const { transacciones, error } = await traerTransacciones({
    ascendente: true,
    ...(mes ? rangoMes(mes) : {}),
  });

  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }

  const nombre = mes ? nombreArchivoExportMes(mes) : nombreArchivoExport(hoyISO());

  return new NextResponse(BOM + transaccionesACSV(transacciones), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nombre}"`,
      "Cache-Control": "no-store",
    },
  });
}
