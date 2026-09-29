import Link from "next/link";
import PantallaEstado, { BOTON_PRINCIPAL } from "@/components/pantalla-estado";

/**
 * Página inexistente: una URL que no coincide con ninguna ruta, o una
 * pantalla que llama a `notFound()`. Sin esto se veía el 404 genérico de
 * Next, en inglés y sin forma de volver.
 */
export default function NoEncontrada() {
  return (
    <PantallaEstado
      titulo="No encontramos esta página"
      mensaje="El link puede estar mal escrito o la página ya no existe."
    >
      <Link href="/" className={BOTON_PRINCIPAL}>
        Volver a Movimientos
      </Link>
    </PantallaEstado>
  );
}
