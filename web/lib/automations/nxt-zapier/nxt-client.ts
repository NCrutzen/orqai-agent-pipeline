/**
 * NXT API client. Gebruikt getValidToken() om te authenticeren.
 * Eén-op-één gebaseerd op de in `spike-capture-create-post.ts` reverse-engineerde
 * payload structuur.
 */

import { getValidToken, type NxtEnvironment } from "./token-store";

const NXT_BASES: Record<NxtEnvironment, string> = {
  acceptance: "https://acc.sb.n-xt.org",
  production: "https://sb.n-xt.org",
};

export interface SalesOrderLine {
  itemId: string;
  itemDescription: string;
  quantity: number;
  price: number;
  discount?: number;
  transferToUsage?: boolean;
}

export interface CreateSalesOrderInput {
  env: NxtEnvironment;
  customerId: number;
  siteId: string;
  brandId: string;
  orderTypeId: string;
  lines: SalesOrderLine[];
  references?: { reference1?: string; reference2?: string; reference3?: string };
  notes?: Array<{ typeId: string; title?: string; body?: string }>;
}

export interface CreateSalesOrderResult {
  id: string;          // UUID
  internalId: number;  // visible code (bv 374103)
  date: string;
  customerId: number;
  siteId: number;
  orderStatusId: string;
  raw: unknown;
}

async function nxtFetch(
  env: NxtEnvironment,
  path: string,
  init: RequestInit & { body?: string } = {}
): Promise<Response> {
  const token = await getValidToken(env);
  const cb = `cacheBuster=${Date.now()}`;
  const url = `${NXT_BASES[env]}${path}${path.includes("?") ? "&" : "?"}${cb}`;
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`NXT ${init.method ?? "GET"} ${path} failed ${res.status}: ${text.slice(0, 400)}`);
  }
  return res;
}

export async function createSalesOrder(
  input: CreateSalesOrderInput
): Promise<CreateSalesOrderResult> {
  const payload = {
    orderLines: input.lines.map((l) => ({
      quantity: l.quantity,
      price: l.price,
      discount: l.discount ?? 0,
      itemId: l.itemId,
      itemDescription: l.itemDescription,
      transferToUsage: l.transferToUsage === false ? "false" : "true",
      priceOrigin: "USER",
      priceOriginId: "Zapier",
    })),
    notes: input.notes ?? [],
    date: new Date().toISOString(),
    brandId: input.brandId,
    orderTypeId: input.orderTypeId,
    isStockAllocationRequired: null,
    isDirectInvoice: true,
    siteId: input.siteId,
    customerId: input.customerId,
    orderStatusId: "prospect",
    prospect: true,
    references: input.references ?? {},
  };

  const res = await nxtFetch(input.env, "/api/orders", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const json = (await res.json()) as Record<string, unknown>;

  return {
    id: json.id as string,
    internalId: json.internalId as number,
    date: json.date as string,
    customerId: json.customerId as number,
    siteId: json.siteId as number,
    orderStatusId: json.orderStatusId as string,
    raw: json,
  };
}

// --- Lookups voor Zapier dynamic dropdowns ---

export async function listOrderTypes(env: NxtEnvironment): Promise<Array<{ id: string; name: string }>> {
  const res = await nxtFetch(env, "/api/orders/types", {
    method: "POST",
    body: JSON.stringify({ status: "active", availableForEntry: true }),
  });
  const json = (await res.json()) as Array<{ id: string; name: string }>;
  return json.map((o) => ({ id: o.id, name: o.name }));
}

export async function listBrands(env: NxtEnvironment): Promise<Array<{ id: string; name: string }>> {
  const res = await nxtFetch(env, "/api/brands/filtered");
  const json = (await res.json()) as Array<{ id: string; name: string }>;
  return json.map((b) => ({ id: b.id, name: b.name }));
}

export async function searchCustomers(
  env: NxtEnvironment,
  searchTerm: string
): Promise<Array<{ id: number; name: string; brandId: string }>> {
  const res = await nxtFetch(env, "/api/customers", {
    method: "POST",
    body: JSON.stringify({ searchTerm }),
  });
  const json = (await res.json()) as Array<{ id: number; name: string; brandId: string }>;
  return json.map((c) => ({ id: c.id, name: c.name, brandId: c.brandId }));
}

export async function listSites(
  env: NxtEnvironment,
  customerId: number
): Promise<Array<{ id: string; name: string; brandId: string }>> {
  const res = await nxtFetch(env, "/api/sites", {
    method: "POST",
    body: JSON.stringify({ customerId, status: "ACTIVE", size: 3000 }),
  });
  const json = (await res.json()) as Array<{ id: string; name: string; brandId: string }>;
  return json.map((s) => ({ id: s.id, name: s.name, brandId: s.brandId }));
}

export async function searchItems(
  env: NxtEnvironment,
  searchTerm: string
): Promise<Array<{ id: string; description: string; salesPackagePrice: number }>> {
  const res = await nxtFetch(env, "/api/items/search", {
    method: "POST",
    body: JSON.stringify({ searchTerm, defaultItemsOnly: true, includeInactive: false }),
  });
  const json = (await res.json()) as { content: Array<{ id: string; description: string; salesPackagePrice: number }> };
  return json.content.map((i) => ({
    id: i.id,
    description: i.description,
    salesPackagePrice: i.salesPackagePrice,
  }));
}

export async function determinePrice(
  env: NxtEnvironment,
  customerId: number,
  siteId: string,
  itemId: string,
  quantity: number
): Promise<{ price: number; discount: number }> {
  const res = await nxtFetch(env, "/api/prices/determine", {
    method: "POST",
    body: JSON.stringify({ customerId, siteId, itemId, quantity }),
  });
  const json = (await res.json()) as { price: number; discount: number };
  return { price: json.price, discount: json.discount };
}
