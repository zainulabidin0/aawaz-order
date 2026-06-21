// Shopify order creation via GraphQL Admin API — orders go directly to Orders (not Drafts)

const ORDER_CREATE_MUTATION = `
  mutation orderCreate($order: OrderCreateOrderInput!, $options: OrderCreateOptionsInput) {
    orderCreate(order: $order, options: $options) {
      order {
        id
        name
        displayFinancialStatus
        displayFulfillmentStatus
      }
      userErrors {
        field
        message
      }
    }
  }
`;

/** Fallback if orderCreate is unavailable on a shop API version. */
const COMPLETE_DRAFT_ORDER_MUTATION = `
  mutation draftOrderComplete($id: ID!, $paymentPending: Boolean) {
    draftOrderComplete(id: $id, paymentPending: $paymentPending) {
      draftOrder {
        id
        order {
          id
          name
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const CREATE_DRAFT_ORDER_MUTATION = `
  mutation draftOrderCreate($input: DraftOrderInput!) {
    draftOrderCreate(input: $input) {
      draftOrder {
        id
        name
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export type CreateOrderParams = {
  variantId: string;
  quantity: number;
  customerName: string;
  phone: string;
  address1: string;
  city: string;
  country: string;
  countryCode: string;
  note: string;
};

export type ShopifyOrderResult = {
  orderId: string;
  orderName: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = { graphql: (query: string, options?: any) => Promise<any> };

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/);
  return {
    firstName: parts[0] || fullName || "Customer",
    lastName: parts.slice(1).join(" ") || ".",
  };
}

function buildAddressInput(params: CreateOrderParams) {
  const { firstName, lastName } = splitName(params.customerName);
  const address1 = params.address1?.trim() || "Address on file";

  return {
    firstName,
    lastName,
    phone: params.phone,
    address1,
    city: params.city || "Unknown",
    country: params.country,
    countryCode: params.countryCode,
    province: params.city || "",
    zip: "00000",
  };
}

function parseGraphqlErrors(body: {
  errors?: Array<{ message: string }>;
  data?: Record<string, unknown>;
}) {
  if (body?.errors?.length) {
    throw new Error(
      `Shopify GraphQL error: ${body.errors.map((e) => e.message).join(", ")}`,
    );
  }
}

/**
 * Creates a real Shopify order (COD / payment pending) — appears in Admin → Orders.
 */
export async function createShopifyOrder(
  admin: AdminClient,
  params: CreateOrderParams,
): Promise<ShopifyOrderResult> {
  if (!params.variantId) {
    throw new Error("Missing product variant — customer must select size/color");
  }

  const quantity = Math.max(1, Math.floor(params.quantity || 1));
  const shippingAddress = buildAddressInput(params);

  console.log(
    `[shopify-order] creating order variant=${params.variantId} qty=${quantity}`,
  );

  const orderInput = {
    lineItems: [{ variantId: params.variantId, quantity }],
    shippingAddress,
    billingAddress: shippingAddress,
    note: params.note,
    tags: ["voice-order", "cod", "aawaz-order"],
    financialStatus: "PENDING",
    phone: params.phone,
    sourceName: "Aawaz Order",
    customAttributes: [{ key: "payment_method", value: "COD" }],
  };

  const response = await admin.graphql(ORDER_CREATE_MUTATION, {
    variables: {
      order: orderInput,
      options: { sendReceipt: false, sendFulfillmentReceipt: false },
    },
  });

  const body = await response.json();
  parseGraphqlErrors(body);

  const { order, userErrors } = body?.data?.orderCreate ?? {};

  if (userErrors?.length > 0) {
    const msg = userErrors.map((e: { message: string }) => e.message).join(", ");
    console.warn(`[shopify-order] orderCreate failed: ${msg}, trying draft fallback`);
    return createShopifyOrderViaDraft(admin, params, quantity, shippingAddress);
  }

  if (!order?.id) {
    console.warn("[shopify-order] orderCreate returned no order, trying draft fallback");
    return createShopifyOrderViaDraft(admin, params, quantity, shippingAddress);
  }

  console.log(`[shopify-order] created ${order.name} (${order.id})`);

  return {
    orderId: order.id,
    orderName: order.name,
  };
}

/** Last-resort: draft + immediate complete → still lands in Orders, not Drafts list. */
async function createShopifyOrderViaDraft(
  admin: AdminClient,
  params: CreateOrderParams,
  quantity: number,
  shippingAddress: ReturnType<typeof buildAddressInput>,
): Promise<ShopifyOrderResult> {
  const draftInput = {
    lineItems: [{ variantId: params.variantId, quantity }],
    shippingAddress,
    billingAddress: shippingAddress,
    note: params.note,
    tags: ["voice-order", "cod", "aawaz-order"],
  };

  const draftRes = await admin.graphql(CREATE_DRAFT_ORDER_MUTATION, {
    variables: { input: draftInput },
  });
  const draftBody = await draftRes.json();
  parseGraphqlErrors(draftBody);

  const { draftOrder, userErrors: draftErrors } =
    draftBody?.data?.draftOrderCreate ?? {};

  if (draftErrors?.length > 0) {
    throw new Error(
      `Shopify order error: ${draftErrors.map((e: { message: string }) => e.message).join(", ")}`,
    );
  }
  if (!draftOrder?.id) {
    throw new Error("Could not create Shopify order");
  }

  const completeRes = await admin.graphql(COMPLETE_DRAFT_ORDER_MUTATION, {
    variables: { id: draftOrder.id, paymentPending: true },
  });
  const completeBody = await completeRes.json();
  parseGraphqlErrors(completeBody);

  const { draftOrder: completed, userErrors: completeErrors } =
    completeBody?.data?.draftOrderComplete ?? {};

  if (completeErrors?.length > 0) {
    throw new Error(
      `Shopify complete order error: ${completeErrors.map((e: { message: string }) => e.message).join(", ")}`,
    );
  }

  const order = completed?.order;
  if (!order?.id) {
    throw new Error(
      "Order was created as draft but could not be completed — check Shopify Admin",
    );
  }

  console.log(`[shopify-order] completed via draft fallback ${order.name}`);

  return {
    orderId: order.id,
    orderName: order.name,
  };
}

/** @deprecated Use createShopifyOrder */
export async function createAndCompleteOrder(
  admin: AdminClient,
  params: CreateOrderParams,
): Promise<ShopifyOrderResult> {
  return createShopifyOrder(admin, params);
}
