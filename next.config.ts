import type { NextConfig } from "next";

// Dev/sandbox: standalone (padrão). GitHub Pages: NEXT_OUTPUT=export
// + NEXT_PUBLIC_BASE_PATH=/<repo> (definido no workflow .github/workflows/deploy.yml).
const isExport = process.env.NEXT_OUTPUT === "export";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || undefined;

const nextConfig: NextConfig = {
  output: isExport ? "export" : "standalone",
  basePath,
  reactStrictMode: false,
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
