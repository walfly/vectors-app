import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['sharp', 'onnxruntime-node'],
};

export default nextConfig;
