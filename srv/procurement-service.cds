namespace nexus.supply;

using {nexus.supply as db} from '../db/schema';

// Secure the service: only authenticated users can access it
@path: '/procurement'
service procurementService @(requires: 'authenticated-user') {

    // 1. Suppliers Catalog
    entity Suppliers as projection on db.Suppliers;
  
    // 2. Products Catalog with localized fields exposed
    entity Products as projection on db.Products;

    // 3. Purchase Orders with Stateful Draft Support
    @cds.redirection.target
    @odata.draft.enabled
    entity PurchaseOrders as projection on db.PurchaseOrders {
        *,
        supplier : redirected to Suppliers,
        items    : redirected to OrderItems
    } actions {
        @(requires: 'ProcurementManager')
        action approvePO() returns PurchaseOrders;
    };

    // 4. Order Items (Exposed as a composition child)
    @cds.redirection.target
    entity OrderItems as projection on db.OrderItems {
        *,
        product : redirected to Products
    };

    function canApprovePurchaseOrders() returns Boolean;

    // 5. Read-Only Financial Reporting View
    @readonly
    entity FinancialSummary as projection on db.PO_FinancialSummary;

  // Define an Outbound Enterprise Event

    event OrderApproved {
        ID          : UUID;
        orderNumber : String;
        totalAmount : Decimal(12,2);
        approvedBy  : String;
    }
}