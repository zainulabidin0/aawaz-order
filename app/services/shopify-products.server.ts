// Shopify product search via GraphQL Admin API

const SEARCH_PRODUCTS_QUERY = `
  query searchProducts($query: String!, $first: Int!) {
    products(first: $first, query: $query) {
      nodes {
        id
        title
        handle
        status
        images(first: 1) {
          nodes {
            url
            altText
          }
        }
        variants(first: 1) {
          nodes {
            id
            title
            price
            availableForSale
            inventoryQuantity
          }
        }
      }
    }
  }
`;

export type ShopifyProduct = {
  id: string;
  title: string;
  handle: string;
  status: string;
  imageUrl: string | null;
  variantId: string;
  variantTitle: string;
  price: string;
  availableForSale: boolean;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = { graphql: (query: string, options?: any) => Promise<any> };

/**
 * Searches the Shopify product catalog by keyword.
 * Tries the full query first, then falls back to the first meaningful word.
 */
export async function searchProducts(
  admin: AdminClient,
  query: string,
  limit = 5
): Promise<ShopifyProduct[]> {
  const results = await runQuery(admin, query, limit);
  if (results.length > 0) return results;

  const fallbackWord = query.split(" ").find((w) => w.length > 2);
  if (fallbackWord && fallbackWord !== query) {
    return runQuery(admin, fallbackWord, limit);
  }
  return [];
}

async function runQuery(
  admin: AdminClient,
  queryStr: string,
  limit: number
): Promise<ShopifyProduct[]> {
  const response = await admin.graphql(SEARCH_PRODUCTS_QUERY, {
    variables: { query: queryStr, first: limit },
  });

  const body = await response.json();
  const nodes = body?.data?.products?.nodes ?? [];

  return (nodes as Array<{
    id: string;
    title: string;
    handle: string;
    status: string;
    images: { nodes: Array<{ url: string; altText: string | null }> };
    variants: {
      nodes: Array<{
        id: string;
        title: string;
        price: string;
        availableForSale: boolean;
        inventoryQuantity: number;
      }>;
    };
  }>)
    .filter((p) => p.status === "ACTIVE")
    .map((p) => {
      const variant = p.variants.nodes[0];
      const image = p.images.nodes[0];
      return {
        id: p.id,
        title: p.title,
        handle: p.handle,
        status: p.status,
        imageUrl: image?.url ?? null,
        variantId: variant?.id ?? "",
        variantTitle: variant?.title ?? "",
        price: variant?.price ?? "0.00",
        availableForSale: variant?.availableForSale ?? false,
      };
    });
}
