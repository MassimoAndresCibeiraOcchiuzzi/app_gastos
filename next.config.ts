import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse arrastra pdfjs-dist, que espera resolverse en tiempo de
  // ejecución (workers, fuentes estándar). Bundlearlo lo rompe.
  serverExternalPackages: ["pdf-parse"],
};

export default nextConfig;
