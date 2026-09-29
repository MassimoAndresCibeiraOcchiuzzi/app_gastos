import { DM_Sans, Space_Grotesk } from "next/font/google";

/**
 * Las fuentes de la app, definidas una sola vez. Las usan el layout raíz y
 * `global-error.tsx`, que cuando se activa reemplaza al layout y tiene que
 * cargar las suyas.
 */

// Cuerpo: DM Sans, geométrica-humanista, muy legible en tamaños chicos.
export const dmSans = DM_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
});

// Títulos y números destacados: Space Grotesk, geométrica con carácter
// (estilo fintech). No es de las genéricas por defecto (Inter/Roboto/Arial).
export const spaceGrotesk = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

/** Clases para el <html>: las variables de las dos fuentes. */
export const CLASES_FUENTES = `${dmSans.variable} ${spaceGrotesk.variable}`;
