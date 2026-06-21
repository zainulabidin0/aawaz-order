import db from "../db.server";
import { sessionStorage } from "../shopify.server";

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

const GRAPHQL_API_PATH = "2024-01";

export function isShopifyUnauthorized(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const response = (err as { response?: { code?: number } }).response;
  if (response?.code === 401) return true;
  const message = err instanceof Error ? err.message : String(err);
  return message.includes("401") || message.includes("Unauthorized");
}

type AdminClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

function createAdminClient(shop: string, accessToken: string): AdminClient {
  const domain = normalizeShopDomain(shop);
  return {
    graphql: async (query, options) => {
      return fetch(`https://${domain}/admin/api/${GRAPHQL_API_PATH}/graphql.json`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
        },
        body: JSON.stringify({
          query,
          variables: options?.variables,
        }),
      });
    },
  };
}

async function probeAccessToken(
  shop: string,
  accessToken: string,
): Promise<boolean> {
  const domain = normalizeShopDomain(shop);
  try {
    const res = await fetch(
      `https://${domain}/admin/api/${GRAPHQL_API_PATH}/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
        },
        body: JSON.stringify({ query: "{ shop { name } }" }),
      },
    );
    if (res.status === 401) return false;
    const body = await res.json();
    return Boolean(body?.data?.shop?.name);
  } catch {
    return false;
  }
}

/** Remove revoked tokens left behind when APP_UNINSTALLED webhook was missed. */
async function purgeInvalidSessions(shop: string): Promise<number> {
  const normalized = normalizeShopDomain(shop);
  const sessions = await db.session.findMany({ where: { shop: normalized } });
  let removed = 0;

  for (const sess of sessions) {
    if (!sess.accessToken) {
      await db.session.delete({ where: { id: sess.id } }).catch(() => {});
      removed++;
      continue;
    }
    const valid = await probeAccessToken(normalized, sess.accessToken);
    if (!valid) {
      console.warn(`[shopify-admin] purging invalid session ${sess.id}`);
      await db.session.delete({ where: { id: sess.id } }).catch(() => {});
      removed++;
    }
  }

  return removed;
}

/**
 * Find any stored session with a working Admin API token.
 * Prefers offline sessions for long-lived storefront access.
 */
async function resolveValidSession(shop: string) {
  const normalized = normalizeShopDomain(shop);
  let sessions = await db.session.findMany({ where: { shop: normalized } });

  sessions = [...sessions].sort((a, b) => {
    if (a.isOnline === b.isOnline) return 0;
    return a.isOnline ? 1 : -1;
  });

  for (const sess of sessions) {
    if (!sess.accessToken) continue;
    const valid = await probeAccessToken(normalized, sess.accessToken);
    if (valid) {
      console.log(
        `[shopify-admin] using session ${sess.id} (online=${sess.isOnline})`,
      );
      return sess;
    }
  }

  const purged = await purgeInvalidSessions(normalized);
  if (purged > 0) {
    console.warn(
      `[shopify-admin] purged ${purged} invalid session(s) for ${normalized}`,
    );
  }

  throw new ShopifyConnectionError(
    "No valid store session. Open this app from Shopify Admin to reconnect.",
    "no_session",
  );
}

/**
 * Admin API client for storefront / background use.
 * Validates tokens and drops stale rows from missed uninstall webhooks.
 */
export async function getOfflineAdmin(shop: string) {
  const normalized = normalizeShopDomain(shop);
  if (!normalized) {
    throw new ShopifyConnectionError("Missing shop domain", "no_session");
  }

  const session = await resolveValidSession(normalized);
  return {
    admin: createAdminClient(normalized, session.accessToken),
    session,
  };
}

/** Health check using the merchant's live embedded-app session. */
export async function verifyAdminConnection(
  admin: AdminClient,
): Promise<{ ok: boolean; shopName?: string; error?: string }> {
  try {
    const response = await admin.graphql(`#graphql
      query { shop { name } }
    `);
    const body = await response.json();
    if (response.status === 401 || isShopifyUnauthorized(body)) {
      return {
        ok: false,
        error: "Admin session unauthorized. Reload this page.",
      };
    }
    if (body?.errors?.length) {
      return { ok: false, error: body.errors[0]?.message ?? "GraphQL error" };
    }
    return { ok: true, shopName: body?.data?.shop?.name };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Connection check failed",
    };
  }
}

/** Health check for storefront voice orders (needs stored offline token). */
export async function verifyStorefrontConnection(shop: string): Promise<{
  ok: boolean;
  shopName?: string;
  error?: string;
  offlineSessionId?: string;
}> {
  try {
    const { admin, session } = await getOfflineAdmin(shop);
    const response = await admin.graphql(`#graphql
      query { shop { name } }
    `);
    const body = await response.json();
    if (body?.errors?.length) {
      return {
        ok: false,
        offlineSessionId: session.id,
        error: body.errors[0]?.message ?? "GraphQL error",
      };
    }
    return {
      ok: true,
      shopName: body?.data?.shop?.name,
      offlineSessionId: session.id,
    };
  } catch (err) {
    if (err instanceof ShopifyConnectionError) {
      return { ok: false, error: err.message };
    }
    if (isShopifyUnauthorized(err)) {
      return {
        ok: false,
        error:
          "Storefront access expired. Reload this app from Shopify Admin.",
      };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Connection check failed",
    };
  }
}

/** Called on admin app load — purge stale tokens so reinstall can recover. */
export async function healShopSessions(shop: string): Promise<void> {
  const normalized = normalizeShopDomain(shop);
  const offline = await sessionStorage.loadSession(offlineSessionId(normalized));
  if (!offline?.accessToken) return;

  const valid = await probeAccessToken(normalized, offline.accessToken);
  if (!valid) {
    console.warn(
      `[shopify-admin] healing: offline token invalid for ${normalized}, purging all sessions`,
    );
    await db.session.deleteMany({ where: { shop: normalized } });
  }
}
