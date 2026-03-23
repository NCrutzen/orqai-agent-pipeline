# Systems Registry

This file defines the IT systems your organization uses and how agents should integrate with them. Edit this file to match your environment.

When the pipeline encounters a use case mentioning one of these systems, it uses the integration method you specify here to determine the right approach (API call, browser automation, knowledge base lookup, or manual handoff).

## How to Use

Add each system your agents may need to interact with. For each system, specify:
- **Name:** The system name as users refer to it
- **Integration method:** One of `api`, `browser-automation`, `knowledge-base`, `manual`, or `none`
- **Details:** URL, API docs location, authentication method, or notes about access

Remove the examples below and add your own systems.

## Your Systems

### Example: CRM System
- **Integration method:** api
- **URL:** https://crm.example.com
- **API docs:** https://docs.crm.example.com/api
- **Auth:** OAuth2 / API key
- **Notes:** Customer lookup, ticket creation, contact management

### Example: Legacy Billing Portal
- **Integration method:** browser-automation
- **URL:** https://billing.internal.example.com
- **Auth:** Username/password (SSO not supported)
- **Notes:** No API available. Invoice lookup, payment status checks. Requires Playwright script via MCP tool.

### Example: Company Wiki
- **Integration method:** knowledge-base
- **URL:** https://wiki.example.com
- **Notes:** HR policies, product documentation. Upload relevant pages to Orq.ai Knowledge Base.

### Example: Physical Warehouse
- **Integration method:** manual
- **Notes:** Inventory checks require human verification. Agent should generate a request for warehouse staff.
