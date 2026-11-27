import type { NextConfig } from "next";

const config: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  serverExternalPackages: ["mcp-handler", "@modelcontextprotocol/server"],
};

export default config;
