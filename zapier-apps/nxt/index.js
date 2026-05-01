/**
 * Moyne Roberts — NXT integration voor Zapier.
 *
 * Architectuur:
 *   Zapier action -> ${baseUrl}/api/automations/nxt/<action>
 *                      (Vercel, Next.js)
 *                   -> NXT API via Browserless-bootstrapped JWT
 *
 * De Zap-builder authenticeert tegen Vercel met een shared secret. De Vercel-
 * route handelt de NXT-auth + actuele API-call af. Voordeel: alle NXT-logica
 * blijft in één codebase en hoeven we niet steeds in Zapier te updaten.
 */

const authentication = require("./authentication");
const createSalesOrder = require("./creates/sales-order");
const customerList = require("./triggers/customers");
const siteList = require("./triggers/sites");
const brandList = require("./triggers/brands");
const orderTypeList = require("./triggers/order-types");
const itemList = require("./triggers/items");

const addAuthHeader = (request, z, bundle) => {
  if (bundle.authData.secret) {
    request.headers["X-Webhook-Secret"] = bundle.authData.secret;
  }
  return request;
};

module.exports = {
  version: require("./package.json").version,
  platformVersion: require("zapier-platform-core").version,
  authentication,
  beforeRequest: [addAuthHeader],
  triggers: {
    [customerList.key]: customerList,
    [siteList.key]: siteList,
    [brandList.key]: brandList,
    [orderTypeList.key]: orderTypeList,
    [itemList.key]: itemList,
  },
  searches: {},
  creates: {
    [createSalesOrder.key]: createSalesOrder,
  },
};
