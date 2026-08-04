import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typedRoutes: true,
  turbopack: {
    root: process.cwd()
  }
};

export default nextConfig;
