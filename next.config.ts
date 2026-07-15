import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf.js's legacy Node build (used by the flattened-PDF fallback) doesn't
  // survive server bundling — load it from node_modules at runtime instead.
  serverExternalPackages: ['pdfjs-dist'],
};

export default nextConfig;
