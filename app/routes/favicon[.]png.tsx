import type { LoaderFunctionArgs } from "@remix-run/node";

export async function loader({ request }: LoaderFunctionArgs) {
  return new Response(null, {
    status: 204,
    headers: { "Cache-Control": "public, max-age=86400" },
  });
}
