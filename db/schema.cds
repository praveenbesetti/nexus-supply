namespace nexus.supply;



using { cuid, managed } from '@sap/cds/common';

// 1. Suppliers Master Data
entity Suppliers : cuid, managed {
    name     : String(100);
    email    : String(100);
    country  : String(50);
    products : Association to many Products on products.supplier = $self;
}

// 2. Products Catalog with Localized descriptions (.texts companion generation)
entity Products : cuid, managed {
    name        : localized String(100);
    description : localized String(500);
    price       : Decimal(9,2);
    supplier    : Association to Suppliers;
}

// 3. Purchase Orders (Parent Entity with Composition for Deep Inserts)
entity PurchaseOrders : cuid, managed {
    orderNumber : String(20);
    status      : String(20) default 'Draft'; // Draft, Submitted, Approved, Rejected
    supplier    : Association to Suppliers;
    
    // Composition: Deleting or creating a PO automatically manages its items
    items       : Composition of many OrderItems on items.parent = $self;
    totalAmount : Decimal(12,2);
}

// 4. Order Items (Child Entity)
entity OrderItems : cuid {
    parent    : Association to PurchaseOrders;
    product   : Association to Products;
    quantity  : Integer;
    itemTotal : Decimal(9,2);
}

// 5. Custom Database View for Financial Summaries & Reporting
view PO_FinancialSummary as select from PurchaseOrders {
    key ID           as poID,
    orderNumber,
    status,
    supplier.name    as supplierName,
    totalAmount,
    createdAt
};