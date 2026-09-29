import type { SegmentoCuenta } from "@/lib/dashboard";
import { formatearARS } from "@/lib/formato";

/**
 * Cuando "Sin cuenta" pasa este porcentaje, se sugiere cargar la cuenta: con
 * tanto sin asignar, el reparto no dice mucho.
 */
const AVISO_SIN_CUENTA = 30;

/**
 * Egresos del mes por medio de pago: una barra horizontal apilada y, debajo,
 * la leyenda con la etiqueta, el porcentaje y el monto de cada segmento, en
 * el mismo orden y con la misma muestra de color.
 *
 * Las etiquetas van en la leyenda y no adentro de la barra: en un celular un
 * segmento de 5% mide unos 16px y no entra ni el porcentaje; un texto recortado
 * o encimado se lee peor que ninguno. La barra es aria-hidden: la leyenda dice
 * lo mismo con palabras.
 *
 * "Otras" y "Sin cuenta" usan el mismo gris neutro; "Sin cuenta" va rayado
 * para distinguirlas sin agregar un color.
 */
export default function RepartoCuentas({
  segmentos,
}: {
  segmentos: SegmentoCuenta[];
}) {
  if (segmentos.length === 0) {
    return (
      <p className="py-6 text-center text-sm opacity-60">
        No hay egresos en este mes.
      </p>
    );
  }

  const sinCuenta = segmentos.find((s) => s.tipo === "sin-cuenta");

  return (
    <div>
      <div aria-hidden className="animar-entrada flex h-6 w-full gap-[2px]">
        {segmentos.map((s) => (
          <span
            key={s.clave}
            title={`${s.etiqueta}: ${formatoPorcentaje(s.porcentaje)} · ${formatearARS(s.monto)}`}
            className="h-full min-w-[3px] first:rounded-l last:rounded-r"
            style={{ flexGrow: s.monto, flexBasis: 0, ...fondo(s) }}
          />
        ))}
      </div>

      <ul className="mt-3 flex flex-col gap-1.5">
        {segmentos.map((s) => (
          <li key={s.clave} className="flex items-start gap-2.5 text-sm">
            <span
              aria-hidden
              className="mt-1 h-3 w-3 shrink-0 rounded-sm"
              style={fondo(s)}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate">{s.etiqueta}</span>
              {s.agrupa && (
                <span className="block truncate text-xs opacity-60">
                  {s.agrupa.join(", ")}
                </span>
              )}
            </span>
            <span className="shrink-0 font-medium tabular-nums">
              {formatoPorcentaje(s.porcentaje)}
            </span>
            <span className="w-28 shrink-0 text-right tabular-nums opacity-60">
              {formatearARS(s.monto)}
            </span>
          </li>
        ))}
      </ul>

      {sinCuenta && sinCuenta.porcentaje >= AVISO_SIN_CUENTA && (
        <p className="mt-3 text-xs opacity-60">
          El {formatoPorcentaje(sinCuenta.porcentaje)} de los egresos no tiene
          cuenta. Si la completás al cargar un gasto, este reparto te dice más.
        </p>
      )}
    </div>
  );
}

function formatoPorcentaje(p: number): string {
  return `${p.toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`;
}

/** El relleno de un segmento (y de su muestra en la leyenda). */
function fondo(s: SegmentoCuenta): React.CSSProperties {
  if (s.tipo === "sin-cuenta") {
    return {
      backgroundImage: `repeating-linear-gradient(135deg, ${s.color} 0 2px, transparent 2px 4px)`,
    };
  }
  return { backgroundColor: s.color };
}
