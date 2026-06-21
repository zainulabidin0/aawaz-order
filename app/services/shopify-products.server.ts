// Shopify product search and variant matching via GraphQL Admin API

const SEARCH_PRODUCTS_QUERY = `
  query searchProducts($query: String!, $first: Int!) {
    products(first: $first, query: $query) {
      nodes {
        id
        title
        handle
        status
        productType
        images(first: 1) {
          nodes {
            url
            altText
          }
        }
        options {
          name
          values
        }
        variants(first: 100) {
          nodes {
            id
            title
            price
            availableForSale
            inventoryQuantity
            selectedOptions {
              name
              value
            }
          }
        }
      }
    }
  }
`;

export type ProductVariant = {
  id: string;
  title: string;
  price: string;
  availableForSale: boolean;
  selectedOptions: { name: string; value: string }[];
};

export type ProductOption = {
  name: string;
  values: string[];
};

export type ShopifyProduct = {
  id: string;
  title: string;
  handle: string;
  status: string;
  productType: string;
  imageUrl: string | null;
  variantId: string;
  variantTitle: string;
  price: string;
  availableForSale: boolean;
  options: ProductOption[];
  variants: ProductVariant[];
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = { graphql: (query: string, options?: any) => Promise<any> };

type ProductNode = {
  id: string;
  title: string;
  handle: string;
  status: string;
  productType: string;
  images: { nodes: Array<{ url: string; altText: string | null }> };
  options: ProductOption[];
  variants: {
    nodes: Array<{
      id: string;
      title: string;
      price: string;
      availableForSale: boolean;
      inventoryQuantity: number;
      selectedOptions: { name: string; value: string }[];
    }>;
  };
};

function mapProductNode(p: ProductNode): ShopifyProduct {
  const variants: ProductVariant[] = p.variants.nodes.map((v) => ({
    id: v.id,
    title: v.title,
    price: v.price,
    availableForSale: v.availableForSale,
    selectedOptions: v.selectedOptions,
  }));

  const defaultVariant =
    variants.find((v) => v.availableForSale) ?? variants[0];

  const image = p.images.nodes[0];

  return {
    id: p.id,
    title: p.title,
    handle: p.handle,
    status: p.status,
    productType: p.productType ?? "",
    imageUrl: image?.url ?? null,
    variantId: defaultVariant?.id ?? "",
    variantTitle: defaultVariant?.title ?? "",
    price: defaultVariant?.price ?? "0.00",
    availableForSale: defaultVariant?.availableForSale ?? false,
    options: p.options ?? [],
    variants,
  };
}

/** True when the product has meaningful size/color/style choices. */
export function productNeedsVariantChoice(product: ShopifyProduct): boolean {
  const selectable = getSelectableVariants(product);
  return selectable.length > 1;
}

export function getSelectableVariants(product: ShopifyProduct): ProductVariant[] {
  return product.variants.filter(
    (v) =>
      v.availableForSale &&
      v.title !== "Default Title" &&
      !v.title.toLowerCase().includes("default"),
  );
}

function normalizeHint(value: string): string {
  return value.trim().toLowerCase();
}

export type VariantMatchInput = {
  size?: string;
  color?: string;
  variant_options?: Record<string, string>;
  product_query?: string;
  product_query_original?: string;
};

/**
 * Match spoken size/color/options to a Shopify variant.
 * Returns null when ambiguous — caller should ask the customer.
 */
export function matchVariant(
  product: ShopifyProduct,
  extraction: VariantMatchInput,
): ProductVariant | null {
  if (!productNeedsVariantChoice(product)) {
    return (
      product.variants.find((v) => v.availableForSale) ?? product.variants[0] ?? null
    );
  }

  const hints = [
    extraction.size,
    extraction.color,
    ...(extraction.variant_options
      ? Object.entries(extraction.variant_options).flatMap(([k, v]) => [k, v])
      : []),
    extraction.product_query,
    extraction.product_query_original,
  ]
    .filter((h): h is string => Boolean(h && String(h).trim()))
    .map(normalizeHint);

  let best: ProductVariant | null = null;
  let bestScore = 0;

  for (const variant of product.variants) {
    if (!variant.availableForSale) continue;

    const blob = [
      variant.title,
      ...variant.selectedOptions.map((o) => o.value),
      ...variant.selectedOptions.map((o) => o.name),
    ]
      .join(" ")
      .toLowerCase();

    let score = 0;
    for (const hint of hints) {
      if (blob.includes(hint)) score += 4;
      for (const word of hint.split(/[\s,/]+/)) {
        if (word.length > 1 && blob.includes(word)) score += 1;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      best = variant;
    }
  }

  return bestScore >= 3 ? best : null;
}

/** Option names the customer still needs to specify (Size, Color, etc.). */
export function getMissingVariantOptionNames(
  product: ShopifyProduct,
  matched: ProductVariant | null,
): string[] {
  if (!productNeedsVariantChoice(product) || matched) return [];

  return product.options
    .filter((o) => o.name !== "Title" && o.values.length > 1)
    .map((o) => o.name);
}

export function applyVariantToProduct(
  product: ShopifyProduct,
  variant: ProductVariant,
): ShopifyProduct {
  return {
    ...product,
    variantId: variant.id,
    variantTitle: formatVariantLabel(variant),
    price: variant.price,
    availableForSale: variant.availableForSale,
  };
}

export function formatVariantLabel(variant: ProductVariant): string {
  const opts = variant.selectedOptions
    .filter((o) => o.name !== "Title")
    .map((o) => o.value)
    .join(" / ");
  return opts || variant.title;
}

const GET_PRODUCT_QUERY = `
  query getProduct($id: ID!) {
    product(id: $id) {
      id
      title
      handle
      status
      productType
      images(first: 1) {
        nodes { url altText }
      }
      options { name values }
      variants(first: 100) {
        nodes {
          id
          title
          price
          availableForSale
          inventoryQuantity
          selectedOptions { name value }
        }
      }
    }
  }
`;

export async function getProductById(
  admin: AdminClient,
  productId: string,
): Promise<ShopifyProduct | null> {
  const response = await admin.graphql(GET_PRODUCT_QUERY, {
    variables: { id: productId },
  });
  const body = await response.json();
  const node = body?.data?.product as ProductNode | null;
  if (!node || node.status !== "ACTIVE") return null;
  return mapProductNode(node);
}

export async function searchProducts(
  admin: AdminClient,
  query: string,
  limit = 5,
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
  limit: number,
): Promise<ShopifyProduct[]> {
  const response = await admin.graphql(SEARCH_PRODUCTS_QUERY, {
    variables: { query: queryStr, first: limit },
  });

  const body = await response.json();
  const nodes = (body?.data?.products?.nodes ?? []) as ProductNode[];

  return nodes
    .filter((p) => p.status === "ACTIVE")
    .map(mapProductNode);
}
