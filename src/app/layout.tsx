import type { Metadata, Viewport } from "next";
import { DM_Sans, Space_Grotesk } from "next/font/google";
import "./globals.css";
import ServiceWorkerRegister from "./service-worker-register";

// Cuerpo: DM Sans, geométrica-humanista, muy legible en tamaños chicos.
const dmSans = DM_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
});

// Títulos y números destacados: Space Grotesk, geométrica con carácter
// (estilo fintech). No es de las genéricas por defecto (Inter/Roboto/Arial).
const spaceGrotesk = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "Gastos",
    template: "%s · Gastos",
  },
  description: "Control de gastos personales.",
  applicationName: "Gastos",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Gastos",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  // Acompaña el fondo de cada tema en la barra del navegador / PWA.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#16121c" },
  ],
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${dmSans.variable} ${spaceGrotesk.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
