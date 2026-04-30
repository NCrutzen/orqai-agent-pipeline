/**
 * Action: Create Sales Order — maakt een prospect/draft sales order in NXT
 * door onze Vercel-route /api/automations/nxt/create-sales-order aan te roepen.
 *
 * Voor v1 vragen we naar IDs (customer/site/brand/orderType/item) zodat we
 * geen lookup-endpoints in de Zapier-app hoeven implementeren. Volgende
 * iteratie: dynamic dropdowns.
 */

const perform = async (z, bundle) => {
  const i = bundle.inputData;

  const lines = [
    {
      itemId: i.itemId,
      quantity: Number(i.quantity ?? 1),
      price: Number(i.price ?? 0),
      discount: Number(i.discount ?? 0),
      transferToUsage: i.transferToUsage !== "false",
    },
  ];
  if (i.itemDescription) lines[0].itemDescription = i.itemDescription;

  const body = {
    env: i.env || "acceptance",
    customerId: Number(i.customerId),
    siteId: String(i.siteId),
    brandId: String(i.brandId),
    orderTypeId: String(i.orderTypeId),
    lines,
    references:
      i.reference1 || i.reference2 || i.reference3
        ? {
            reference1: i.reference1 || undefined,
            reference2: i.reference2 || undefined,
            reference3: i.reference3 || undefined,
          }
        : undefined,
  };

  const response = await z.request({
    url: `${bundle.authData.baseUrl}/api/automations/nxt/create-sales-order`,
    method: "POST",
    headers: {
      "X-Webhook-Secret": bundle.authData.secret,
      "Content-Type": "application/json",
    },
    body,
  });

  if (response.status >= 400) {
    throw new z.errors.Error(
      `NXT create failed (${response.status}): ${response.content}`,
      "CreateFailed",
      response.status
    );
  }

  const data = response.json;
  return {
    id: data.id,
    internalId: data.internalId,
    orderStatusId: data.orderStatusId,
    url: data.url,
    raw: data,
  };
};

module.exports = {
  key: "createSalesOrder",
  noun: "Sales Order",
  display: {
    label: "Create Sales Order",
    description:
      "Maakt een prospect (draft) sales order aan in NXT met één regel.",
  },
  operation: {
    perform,
    inputFields: [
      {
        key: "env",
        label: "Environment",
        choices: { acceptance: "Acceptance", production: "Production" },
        default: "acceptance",
        required: true,
      },
      {
        key: "customerId",
        label: "Customer ID",
        type: "integer",
        helpText: "NXT customer-id, bv. 200007 voor Beter Horen BV.",
        required: true,
      },
      {
        key: "siteId",
        label: "Site ID",
        type: "string",
        helpText: "NXT site-id, bv. 318887.",
        required: true,
      },
      {
        key: "brandId",
        label: "Brand ID",
        type: "string",
        helpText: "Brand-code, bv. SB.",
        required: true,
      },
      {
        key: "orderTypeId",
        label: "Order Type",
        type: "string",
        helpText: "Bv. DO (Directe Order), AI (Detectie Installatie).",
        required: true,
        default: "DO",
      },
      {
        key: "itemId",
        label: "Item ID",
        type: "string",
        helpText: "NXT artikelnummer voor de regel.",
        required: true,
      },
      {
        key: "itemDescription",
        label: "Item Description",
        type: "string",
        helpText:
          "Optioneel — wordt automatisch opgehaald via de NXT item-search wanneer leeg.",
        required: false,
      },
      {
        key: "quantity",
        label: "Quantity",
        type: "number",
        default: "1",
        required: true,
      },
      {
        key: "price",
        label: "Unit Price",
        type: "number",
        helpText: "Prijs per eenheid (€).",
        required: true,
      },
      {
        key: "discount",
        label: "Discount",
        type: "number",
        default: "0",
        required: false,
      },
      {
        key: "transferToUsage",
        label: "Transfer to usage",
        type: "string",
        choices: { true: "True", false: "False" },
        default: "true",
        required: false,
      },
      {
        key: "reference1",
        label: "Reference 1",
        type: "string",
        required: false,
      },
      {
        key: "reference2",
        label: "Reference 2",
        type: "string",
        required: false,
      },
      {
        key: "reference3",
        label: "Reference 3",
        type: "string",
        required: false,
      },
    ],
    sample: {
      id: "fef77092-bf87-4e33-a26c-6b9264c8009d",
      internalId: 374103,
      orderStatusId: "prospect",
      url: "https://acc.sb.n-xt.org/#/orders/filter/list/detail/fef77092-bf87-4e33-a26c-6b9264c8009d",
    },
    outputFields: [
      { key: "id", label: "Order UUID" },
      { key: "internalId", label: "Order Number", type: "integer" },
      { key: "orderStatusId", label: "Status" },
      { key: "url", label: "NXT Detail URL" },
    ],
  },
};
