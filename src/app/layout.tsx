import type { Metadata, Viewport } from "next";
import "./globals.css";
import { CLASES_FUENTES } from "./fuentes";
import ServiceWorkerRegister from "./service-worker-register";

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
      className={`${CLASES_FUENTES} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
