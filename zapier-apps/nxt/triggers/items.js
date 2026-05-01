const perform = async (z, bundle) => {
  const env = bundle.inputData?.env || "acceptance";
  const q =
    bundle.meta?.searchTerm ??
    bundle.inputData?.search ??
    bundle.inputData?.q ??
    "";

  const response = await z.request({
    url: `${bundle.authData.baseUrl}/api/automations/nxt/lookup/items`,
    method: "GET",
    params: { env, q },
    headers: { "X-Webhook-Secret": bundle.authData.secret },
  });
  if (response.status >= 400) {
    throw new z.errors.Error(
      `Item lookup failed (${response.status}): ${response.content}`,
      "LookupFailed",
      response.status
    );
  }
  return response.json;
};

module.exports = {
  key: "itemList",
  noun: "Item",
  display: {
    label: "Search Items",
    description: "Hidden trigger voor de Item dropdown (zoek op artikelnummer of omschrijving).",
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
      id: "6410005107",
      name: "6410005107 — Herhaling BHV 1dag - p/p",
      description: "Herhaling BHV 1dag - p/p",
      salesPackagePrice: 304.5,
    },
    outputFields: [
      { key: "id", label: "Item ID" },
      { key: "name", label: "Display Label" },
      { key: "description", label: "Description" },
      { key: "salesPackagePrice", label: "Default Price", type: "number" },
    ],
  },
};
