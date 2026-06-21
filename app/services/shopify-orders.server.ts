// Shopify draft order creation via GraphQL Admin API

const CREATE_DRAFT_ORDER_MUTATION = `
  mutation draftOrderCreate($input: DraftOrderInput!) {
    draftOrderCreate(input: $input) {
      draftOrder {
        id
        name
        totalPrice
        status
        invoiceUrl
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const COMPLETE_DRAFT_ORDER_MUTATION = `
  mutation draftOrderComplete($id: ID!, $paymentPending: Boolean) {
    draftOrderComplete(id: $id, paymentPending: $paymentPending) {
      draftOrder {
        id
        name
        order {
          id
          name
          displayFinancialStatus
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export type DraftOrderResult = {
  id: string;
  name: string;
  totalPrice: string;
  status: string;
  invoiceUrl: string;
};

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = { graphql: (query: string, options?: any) => Promise<any> };

/**
 * Creates a Shopify draft order for COD (cash on delivery).
 */
export async function createDraftOrder(
  admin: AdminClient,
  params: CreateOrderParams
): Promise<DraftOrderResult> {
  const nameParts = params.customerName.split(" ");
  const firstName = nameParts[0] || params.customerName;
  const lastName = nameParts.slice(1).join(" ");

  const input = {
    lineItems: [
      {
        variantId: params.variantId,
        quantity: params.quantity,
      },
    ],
    shippingAddress: {
      firstName,
      lastName,
      phone: params.phone,
      address1: params.address1,
      city: params.city,
      country: params.country,
      countryCode: params.countryCode,
    },
    billingAddress: {
      firstName,
      lastName,
      phone: params.phone,
      address1: params.address1,
      city: params.city,
      country: params.country,
      countryCode: params.countryCode,
    },
    note: params.note,
    tags: ["voice-order", "cod", "aawaz-order"],
  };

  // COD — payment collected on delivery
  Object.assign(input, {
    customAttributes: [{ key: "payment_method", value: "COD" }],
  });

  const response = await admin.graphql(CREATE_DRAFT_ORDER_MUTATION, {
    variables: { input },
  });

  const body = await response.json();
  const { draftOrder, userErrors } = body?.data?.draftOrderCreate ?? {};

  if (userErrors?.length > 0) {
    throw new Error(
      `Shopify draft order error: ${userErrors.map((e: { message: string }) => e.message).join(", ")}`
    );
  }

  if (!draftOrder) {
    throw new Error("Draft order was not created");
  }

  return draftOrder as DraftOrderResult;
}

/**
 * Marks a draft order as complete, converting it to a real order.
 * Used when auto-confirm is enabled.
 */
export async function completeDraftOrder(
  admin: AdminClient,
  draftOrderId: string,
): Promise<{ orderId: string; orderName: string; draftOrderId: string }> {
  const response = await admin.graphql(COMPLETE_DRAFT_ORDER_MUTATION, {
    variables: { id: draftOrderId, paymentPending: true },
  });

  const body = await response.json();
  const { draftOrder, userErrors } = body?.data?.draftOrderComplete ?? {};

  if (userErrors?.length > 0) {
    throw new Error(
      `Shopify complete order error: ${userErrors.map((e: { message: string }) => e.message).join(", ")}`,
    );
  }

  const order = draftOrder?.order;
  if (!order?.id) {
    throw new Error("Draft order was created but could not be completed");
  }

  return {
    orderId: order.id,
    orderName: order.name,
    draftOrderId: draftOrder.id,
  };
}

/** Create draft order and complete it so it appears in Shopify Orders. */
export async function createAndCompleteOrder(
  admin: AdminClient,
  params: CreateOrderParams,
): Promise<{ orderId: string; orderName: string; draftOrderId: string }> {
  const draft = await createDraftOrder(admin, params);
  return completeDraftOrder(admin, draft.id);
}
