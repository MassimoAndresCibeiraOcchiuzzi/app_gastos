import type { NextConfig } from "next";

/**
 * Headers de seguridad para todas las respuestas.
 *
 * - CSP con sólo `frame-ancestors 'none'`: nadie puede embeber la app en un
 *   iframe (clickjacking). No restringe scripts ni estilos: una CSP completa
 *   es otro trabajo, que exige nonces para los scripts inline de Next.
 * - nosniff: el navegador respeta el Content-Type y no "adivina" (que un
 *   archivo servido como texto no se ejecute como script).
 * - Referrer-Policy: a otros sitios sólo les llega el origen, nunca la ruta
 *   ni la query (ahí pueden viajar el mes, o el `code` del login).
 */
const HEADERS_SEGURIDAD = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: HEADERS_SEGURIDAD }];
  },
};

export default nextConfig;
