import type { LoaderFunctionArgs } from "@remix-run/node";

/** Avoid 404 noise in logs for favicon requests. */
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  if (url.pathname.endsWith("favicon.png") || url.pathname.endsWith("favicon.ico")) {
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "public, max-age=86400" },
    });
  }
  return new Response(null, { status: 404 });
}
