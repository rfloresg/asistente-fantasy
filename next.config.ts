import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite trae WebAssembly: que Next no lo empaquete
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
