/**
 * Hidden trigger: Sites filtered by selected customer.
 * Vereist customerId vanuit de parent action (Zapier vult die automatisch).
 */

const perform = async (z, bundle) => {
  const customerId = bundle.inputData?.customerId;
  const env = bundle.inputData?.env || "acceptance";
  if (!customerId) return [];

  const response = await z.request({
    url: `${bundle.authData.baseUrl}/api/automations/nxt/lookup/sites`,
    method: "GET",
    params: { env, customerId },
    headers: { "X-Webhook-Secret": bundle.authData.secret },
  });
  if (response.status >= 400) {
    throw new z.errors.Error(
      `Sites lookup failed (${response.status}): ${response.content}`,
      "LookupFailed",
      response.status
    );
  }
  return response.json;
};

module.exports = {
  key: "siteList",
  noun: "Site",
  display: {
    label: "List Sites for Customer",
    description: "Hidden trigger voor de Site dropdown (gefilterd op customer).",
    hidden: true,
  },
  operation: {
    perform,
    canPaginate: false,
    inputFields: [
      { key: "env", type: "string", required: false },
      { key: "customerId", type: "integer", required: true },
    ],
    sample: {
      id: "318887",
      name: "Beter Horen 214 (318887)",
      siteName: "Beter Horen 214",
      brandId: "SB",
    },
    outputFields: [
      { key: "id", label: "Site ID" },
      { key: "name", label: "Display Name" },
      { key: "siteName", label: "Site Name" },
      { key: "brandId", label: "Brand" },
    ],
  },
};
