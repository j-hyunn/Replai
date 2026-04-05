import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["unpdf"],
  experimental: {
    serverActions: {
      bodySizeLimit: "21mb",
    },
    proxyClientMaxBodySize: "21mb",
  },
};

export default nextConfig;
