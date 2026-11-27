import { protectedResourceHandler } from "mcp-handler";
import { issuer, resourceUrl } from "@/lib/mcp-auth";

export function GET(request: Request) {
  if (!issuer || !resourceUrl) return new Response(null, { status: 404 });
  const metadata = protectedResourceHandler({ authServerUrls: [issuer], resourceUrl });
  return metadata(request);
}
