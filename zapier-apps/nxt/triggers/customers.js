/**
 * Hidden trigger: voedt de Customer dynamic dropdown.
 * Zoekt klanten in NXT op naam (vereist een searchTerm).
 */

const perform = async (z, bundle) => {
  // bundle.meta.zap heeft soms searchTerm, anders pakken we 'm uit inputData
  const q =
    bundle.meta?.searchTerm ??
    bundle.inputData?.search ??
    bundle.inputData?.q ??
    "";
  const env = bundle.inputData?.env || "acceptance";

  const response = await z.request({
    url: `${bundle.authData.baseUrl}/api/automations/nxt/lookup/customers`,
    method: "GET",
    params: { env, q },
    headers: { "X-Webhook-Secret": bundle.authData.secret },
  });
  if (response.status >= 400) {
    throw new z.errors.Error(
      `Customer lookup failed (${response.status}): ${response.content}`,
      "LookupFailed",
      response.status
    );
  }
  return response.json;
};

module.exports = {
  key: "customerList",
  noun: "Customer",
  display: {
    label: "List Customers",
    description: "Hidden trigger voor de Customer dropdown.",
    hidden: true,
  },
  operation: {
    perform,
    canPaginate: false,
    inputFields: [
      { key: "env", type: "string", required: false },
      { key: "search", label: "Search Term", type: "string", required: false },
    ],
    sample: {
      id: 200007,
      name: "Beter Horen BV (200007)",
      customerName: "Beter Horen BV",
      brandId: "SB",
    },
    outputFields: [
      { key: "id", label: "Customer ID", type: "integer" },
      { key: "name", label: "Display Name" },
      { key: "customerName", label: "Customer Name" },
      { key: "brandId", label: "Brand" },
    ],
  },
};
