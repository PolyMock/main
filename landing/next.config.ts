import * as path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
  // Avoid picking an unrelated lockfile outside this app when multiple exist on the machine.
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
