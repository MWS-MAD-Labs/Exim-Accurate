import { healthBody } from "@/lib/health";

// Open on purpose: the proxy does not match this path. A deploy asks it which version is running.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(healthBody());
}
