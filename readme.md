# NexusSupply Procurement Service

NexusSupply is a SAP Cloud Application Programming Model (CAP) backend for
supplier and product data, purchase-order management, and supplier checks
against an external SAP S/4HANA Business Partner service.

## What the project provides

- Supplier and product catalog entities.
- Draft-enabled purchase orders with composed order items.
- Validation of purchase-order totals and supplier IDs.
- A `ProcurementManager`-protected approval action.
- An `OrderApproved` event emitted after an order is approved.
- A financial summary view for reporting.
- SAP HANA and XSUAA resources in the Cloud Foundry deployment descriptor.

The project includes a SAPUI5 freestyle frontend in `app/procurement-portal/`.
It uses XML views and SAP Fiori Horizon controls to manage purchase orders,
suppliers, and products.

## Technology used

| Technology | Use |
|---|---|
| SAP CAP (`@sap/cds`) | CDS data modeling, OData service generation, request handling, and remote-service connectivity |
| CDS (Core Data Services) | Defines entities, associations, compositions, projections, actions, events, and the reporting view |
| Node.js, JavaScript ES modules | Service implementation and application runtime |
| SQLite (`@cap-js/sqlite`) | Local/test database; integration tests use an in-memory database |
| SAP HANA (`@cap-js/hana`) | Production database driver |
| SAP XSUAA (`@sap/xssec`) | Production authentication and role-based authorization |
| SAP CDS MTX (`@sap/cds-mtxs`) | Multitenancy support packages and sidecar profile |
| SAPUI5 | XML-based Fiori Horizon procurement workspace |
| Jest and `@cap-js/cds-test` | HTTP-level CAP integration tests |
| MTA / Cloud Foundry | Application and managed-service deployment description |

Dependency versions and scripts are declared in [package.json](./package.json).

## Project layout

| Path | Purpose |
|---|---|
| `db/schema.cds` | Database entities and financial summary view |
| `db/data/` | CSV seed data for suppliers and products |
| `srv/procurement-service.cds` | Public service projections, OData action, and event definition |
| `srv/procurement-service.js` | Validation, S/4HANA lookup, approval, and event handling |
| `srv/external/` | External S/4HANA service model and test implementation |
| `test/` | Jest integration tests |
| `xs-security.json` | XSUAA scopes, role templates, and role collections |
| `mta.yaml` | Cloud Foundry deployment modules and managed resources |
| `mtx/sidecar/` | CAP multitenancy sidecar package |
| `app/procurement-portal/webapp/view/App.view.xml` | Fiori page shell and navigation |
| `app/procurement-portal/webapp/view/fragments/` | Separate XML tables and dialogs for each workflow |
| `app/procurement-portal/webapp/controller/App.controller.js` | Shared page state, loading, search, and authentication |
| `app/procurement-portal/webapp/controller/actions/` | Separate purchase-order, catalog, and bulk-import handlers |
| `app/procurement-portal/webapp/service/ProcurementApi.js` | Shared OData request and CSRF handling |

## Data model

The model is in [db/schema.cds](./db/schema.cds) and uses the CAP `cuid` and
`managed` aspects where applicable.

- **Suppliers** stores supplier name, email, and country. A supplier can be
  associated with multiple products.
- **Products** stores a localized name and description, price, and supplier
  association.
- **PurchaseOrders** stores the order number, status, supplier, and total.
  Status defaults to `Draft`. Its `items` composition makes order items
  children of the purchase order.
- **OrderItems** stores the parent order, product, quantity, and item total.
- **PO_FinancialSummary** is a read-only model view exposing order, supplier,
  status, and financial summary fields.

Local seed records are loaded from `db/data/nexus.supply-Suppliers.csv` and
`db/data/nexus.supply-Products.csv`.

## Procurement API

The service is named `procurementService` and has the explicit base path
`/procurement`, defined in [srv/procurement-service.cds](./srv/procurement-service.cds).
With the default local port, the service root is:

```text
http://localhost:4004/procurement
```

Examples:

```http
GET  http://localhost:4004/procurement/$metadata
GET  http://localhost:4004/procurement/Suppliers
GET  http://localhost:4004/procurement/Products
GET  http://localhost:4004/procurement/PurchaseOrders
GET  http://localhost:4004/procurement/FinancialSummary
```

`PurchaseOrders` supports OData draft behavior. The bound `approvePO` action
changes the order status to `Approved`. Its action URL uses the service's
fully-qualified name, for example:

```http
POST /procurement/PurchaseOrders(ID='<order-id>',IsActiveEntity=false)/nexus.supply.procurementService.approvePO
```

Check `$metadata` for the exact action signature and entity fields exposed by
the running service.

## Business rules and authorization

The implementation in [srv/procurement-service.js](./srv/procurement-service.js)
applies these rules:

- A provided `totalAmount` must be greater than zero.
- An explicitly provided empty `items` array is rejected.
- If `supplier_ID` is provided, CAP looks up that ID as
  `A_BusinessPartner.BusinessPartner` in S/4HANA.
- A supplier not found in S/4HANA returns HTTP 400. An external-service
  communication failure returns HTTP 502.
- Only a user with the `ProcurementManager` role can approve an order.
- Successful approval emits `OrderApproved`.

The service requires an authenticated user. `xs-security.json` defines the
Admin, User, and ProcurementManager scopes/role collections. The development
mock user `alice` is assigned `ProcurementManager` for local tests; this is not
a production identity configuration.

## Fiori procurement workspace

The SAPUI5 application in `app/procurement-portal/webapp/` provides tabs for
purchase orders, suppliers, and products. Each catalog can be searched and
created from the UI. Suppliers and products also support CSV bulk import.
Purchase orders can be created manually or imported from a CSV with one row per
item; rows with the same order number are grouped into a single PO. The PO
import calculates item and order totals from catalog prices, creates a draft,
adds its items, and activates it. Approval remains a separate manager action.

CSV formats:

```csv
name,email,country
Example Supplier,contact@example.com,Canada
```

```csv
name,description,price,supplier_ID
Example Sensor,Industrial sensor,299.99,sup-001
```

```csv
orderNumber,supplier_ID,product_ID,quantity
PO-2026-001,sup-001,prod-001,2
PO-2026-001,sup-001,prod-001,1
```

Imports send one OData create request per supplier, product, or purchase
order. The import dialog reports row/order failures; successful rows are not
rolled back if another row fails. Purchase-order creation also uses the
backend's S/4HANA supplier validation.

## S/4HANA integration

The external service contract is described in
[srv/external/s4-suppliers.cds](./srv/external/s4-suppliers.cds). The application
connects to the alias `S4BusinessPartnerService` and queries the
`A_BusinessPartner` entity.

- **Development and test:** `srv/external/s4-suppliers-mock.js` supplies
  deterministic partner lookup behavior, so local PO creation and tests do not
  require SAP sandbox credentials or network access.
- **Production:** the service uses the `S4_HANA_DESTINATION` destination.

The local development user `alice` has the `ProcurementManager` role and can
approve POs. The `bob` development user has the regular `User` role and cannot
approve them.

The service uses CAP's built-in `odata-v2` remote-service implementation.
`@cds.external` marks the S/4HANA contract as remote rather than another API
provided by this application. See [srv/external/README.txt](./srv/external/README.txt)
for details about the external model and test mock.

## Events and messaging

The service defines the `OrderApproved` event and emits it when the approval
action succeeds. `package.json` currently configures `local-messaging` and a
`persistent-queue`. The active `mta.yaml` does not provision an enterprise
messaging/Event Mesh resource, so external event delivery must be configured
before relying on it in a deployed environment.

## Run locally

Prerequisites: a supported Node.js version, npm, and dependencies installed
from the project root.

```powershell
npm ci
npx cds watch
```

The API and UI are both served by CAP on port 4004. Start CAP and open
`http://localhost:4004/procurement-portal/webapp/index.html`. The UI5 static
files live under `app/`, which CAP serves from the application root. SAPUI5 is
loaded from the SAPUI5 CDN, so the browser needs internet access. With local
mocked authentication, use **Local sign-in** and the configured development
user. Production authentication continues to use the existing XSUAA session.
`cds watch` reloads the browser when files change; to disable that behavior
while editing the UI, run `npx cds watch --livereload false`.
The development database is stored in `db/nexus-supply.sqlite`; the file is
git-ignored and retains local data across server restarts.

## Run tests

```powershell
npm test -- --runInBand
```

The tests start a CAP server with an in-memory database and use the S/4HANA
mock configured under the `test` profile. The currently active tests cover
purchase-order creation/approval and rejection of a non-existent S/4HANA
supplier. The invalid-total and event-emission test examples in
`test/procurement-service.test.js` are currently commented out and therefore
are not executed.

## Deployment notes

The active modules in [mta.yaml](./mta.yaml) package the UI5 application as an
HTML5 ZIP and deploy it to the SAP HTML5 Applications Repository. The archive
contains the `webapp/` files and `xs-app.json`; its `/procurement` route uses
the `srv-api` destination and forwards the authenticated user's token.
The destination service and HTML5 repository host are provisioned by the MTA.

The HTML5 Applications Repository stores application content; it is not itself
a public application URL. Launch the deployed app from a configured SAP Build
Work Zone/HTML5 runtime, with XSUAA and the `srv-api` destination available to
that runtime. Assign the appropriate XSUAA role collection to each user.

Deployment requires the SAP Cloud Foundry CLI and the MTA build/deploy
tooling. From the project root, build and deploy the archive with:

```powershell
mbt build
cf deploy mta_archives/nexus-supply_1.0.0.mtar
```

The UI ZIP is built from `app/procurement-portal/webapp/` by the
`ui5-task-zipper` UI5 CLI task configured in
`app/procurement-portal/ui5.yaml`.

The repository also contains CAP multitenancy packages and a
`with-mtx-sidecar` profile. However, the active MTA descriptor currently does
not include an MTX sidecar or SaaS registry module. Review and add those
resources before deploying as a multitenant SaaS application.
#   n e x u s - s u p p l y  
 