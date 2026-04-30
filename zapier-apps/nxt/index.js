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
  triggers: {},
  searches: {},
  creates: {
    [createSalesOrder.key]: createSalesOrder,
  },
};
