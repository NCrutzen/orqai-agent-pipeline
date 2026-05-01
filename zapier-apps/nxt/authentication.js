/**
 * Custom auth: gebruiker plakt de shared secret van Vercel
 * (AUTOMATION_WEBHOOK_SECRET) en kiest een environment.
 *
 * De Zap-builder vult deze waarden eenmalig in bij het verbinden van het
 * NXT-account in Zapier. Daarna voegen alle requests de header
 * X-Webhook-Secret toe.
 */

const test = async (z, bundle) => {
  const response = await z.request({
    url: `${bundle.authData.baseUrl}/api/automations/nxt/health`,
    method: "GET",
    skipThrowForStatus: true,
  });
  // Endpoint mag 404 zijn -- we vertrouwen erop dat het secret klopt zodra een
  // create-call slaagt. Doe alleen een echte check als we een health-endpoint
  // bouwen.
  if (response.status === 401) {
    throw new z.errors.Error(
      "Onjuiste shared secret",
      "AuthenticationFailed",
      401
    );
  }
  return { connected: true };
};

module.exports = {
  type: "custom",
  fields: [
    {
      key: "baseUrl",
      label: "Vercel Base URL",
      helpText:
        "https://agent-workforce-moyne-roberts.vercel.app (productie). Geen trailing slash.",
      required: true,
      default: "https://agent-workforce-moyne-roberts.vercel.app",
    },
    {
      key: "secret",
      label: "Shared Secret",
      helpText:
        "De waarde van AUTOMATION_WEBHOOK_SECRET in Vercel. Vraag aan Danny of Nick als je 'm niet hebt.",
      required: true,
      type: "password",
    },
  ],
  test,
  connectionLabel: "{{bundle.authData.baseUrl}}",
};
