const perform = async (z, bundle) => {
  const env = bundle.inputData?.env || "acceptance";
  const response = await z.request({
    url: `${bundle.authData.baseUrl}/api/automations/nxt/lookup/order-types`,
    method: "GET",
    params: { env },
    headers: { "X-Webhook-Secret": bundle.authData.secret },
  });
  if (response.status >= 400) {
    throw new z.errors.Error(
      `Order types lookup failed (${response.status}): ${response.content}`,
      "LookupFailed",
      response.status
    );
  }
  return response.json;
};

module.exports = {
  key: "orderTypeList",
  noun: "Order Type",
  display: {
    label: "List Order Types",
    description: "Hidden trigger voor de Order Type dropdown.",
    hidden: true,
  },
  operation: {
    perform,
    canPaginate: false,
    inputFields: [{ key: "env", type: "string", required: false }],
    sample: { id: "DO", name: "Directe Order" },
    outputFields: [
      { key: "id", label: "Order Type Code" },
      { key: "name", label: "Order Type Name" },
    ],
  },
};
