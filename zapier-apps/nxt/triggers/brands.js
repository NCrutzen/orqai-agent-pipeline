const perform = async (z, bundle) => {
  const env = bundle.inputData?.env || "acceptance";
  const response = await z.request({
    url: `${bundle.authData.baseUrl}/api/automations/nxt/lookup/brands`,
    method: "GET",
    params: { env },
    headers: { "X-Webhook-Secret": bundle.authData.secret },
  });
  if (response.status >= 400) {
    throw new z.errors.Error(
      `Brands lookup failed (${response.status}): ${response.content}`,
      "LookupFailed",
      response.status
    );
  }
  return response.json;
};

module.exports = {
  key: "brandList",
  noun: "Brand",
  display: {
    label: "List Brands",
    description: "Hidden trigger voor de Brand dropdown.",
    hidden: true,
  },
  operation: {
    perform,
    canPaginate: false,
    inputFields: [{ key: "env", type: "string", required: false }],
    sample: { id: "SB", name: "Smeba Brandbeveiliging BV" },
    outputFields: [
      { key: "id", label: "Brand Code" },
      { key: "name", label: "Brand Name" },
    ],
  },
};
