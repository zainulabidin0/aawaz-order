import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";
import { login } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function Index() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", padding: "2rem", maxWidth: 480, margin: "0 auto" }}>
      <h1>Aawaz Order</h1>
      <p>Voice ordering for Shopify stores in Urdu and Punjabi.</p>
      {showForm && (
        <Form method="post" action="/auth/login">
          <label htmlFor="shop" style={{ display: "block", marginBottom: 8 }}>
            Shop domain
          </label>
          <input
            id="shop"
            name="shop"
            type="text"
            placeholder="your-store.myshopify.com"
            style={{ width: "100%", padding: 8, marginBottom: 12 }}
          />
          <button type="submit" style={{ padding: "8px 16px" }}>
            Log in
          </button>
        </Form>
      )}
    </div>
  );
}
