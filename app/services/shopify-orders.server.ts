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
  mutation draftOrderComplete($id: ID!) {
    draftOrderComplete(id: $id) {
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
  draftOrderId: string
): Promise<{ orderId: string; orderName: string }> {
  const response = await admin.graphql(COMPLETE_DRAFT_ORDER_MUTATION, {
    variables: { id: draftOrderId },
  });

  const body = await response.json();
  const { draftOrder, userErrors } = body?.data?.draftOrderComplete ?? {};

  if (userErrors?.length > 0) {
    throw new Error(
      `Shopify complete order error: ${userErrors.map((e: { message: string }) => e.message).join(", ")}`
    );
  }

  const order = draftOrder?.order;
  return {
    orderId: order?.id ?? draftOrderId,
    orderName: order?.name ?? "Draft",
  };
}
