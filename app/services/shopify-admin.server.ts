import { unauthenticated, sessionStorage } from "../shopify.server";

export class ShopifyConnectionError extends Error {
  code: "no_session" | "unauthorized";

  constructor(message: string, code: "no_session" | "unauthorized") {
    super(message);
    this.name = "ShopifyConnectionError";
    this.code = code;
  }
}

/** Normalize storefront shop domain to offline session key format. */
export function normalizeShopDomain(shop: string): string {
  const trimmed = shop.trim().toLowerCase();
  if (!trimmed) return trimmed;
  if (trimmed.endsWith(".myshopify.com")) return trimmed;
  if (trimmed.includes(".")) return trimmed;
  return `${trimmed}.myshopify.com`;
}

function offlineSessionId(shop: string): string {
  return `offline_${normalizeShopDomain(shop)}`;
}

export function isShopifyUnauthorized(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const response = (err as { response?: { code?: number } }).response;
  if (response?.code === 401) return true;
  const message = err instanceof Error ? err.message : String(err);
  return message.includes("401") || message.includes("Unauthorized");
}

/**
 * Admin API client backed by the shop's offline OAuth session.
 * Storefront voice orders require this — online admin sessions won't work.
 */
export async function getOfflineAdmin(shop: string) {
  const normalized = normalizeShopDomain(shop);
  if (!normalized) {
    throw new ShopifyConnectionError("Missing shop domain", "no_session");
  }

  const session = await sessionStorage.loadSession(offlineSessionId(normalized));
  if (!session?.accessToken) {
    console.warn(
      `[shopify-admin] no offline session for ${normalized} (id=${offlineSessionId(normalized)})`,
    );
    throw new ShopifyConnectionError(
      "Store not connected. Open Aawaz Order from Shopify Admin once to reconnect.",
      "no_session",
    );
  }

  console.log(
    `[shopify-admin] offline session for ${normalized} (scopes=${session.scope ?? "unknown"})`,
  );

  try {
    return await unauthenticated.admin(normalized);
  } catch (err) {
    if (isShopifyUnauthorized(err)) {
      throw new ShopifyConnectionError(
        "Store access expired. Open Aawaz Order from Shopify Admin to refresh.",
        "unauthorized",
      );
    }
    throw err;
  }
}

/** Quick health check for merchant settings page. */
export async function verifyShopConnection(shop: string): Promise<{
  ok: boolean;
  shopName?: string;
  error?: string;
}> {
  try {
    const { admin } = await getOfflineAdmin(shop);
    const response = await admin.graphql(`#graphql
      query { shop { name } }
    `);
    const body = await response.json();
    if (body?.errors?.length) {
      return { ok: false, error: body.errors[0]?.message ?? "GraphQL error" };
    }
    return { ok: true, shopName: body?.data?.shop?.name };
  } catch (err) {
    if (err instanceof ShopifyConnectionError) {
      return { ok: false, error: err.message };
    }
    if (isShopifyUnauthorized(err)) {
      return {
        ok: false,
        error:
          "Store access expired. Reload this page or reinstall the app to refresh your token.",
      };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Connection check failed",
    };
  }
}
