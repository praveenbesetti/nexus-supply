sap.ui.define([
    "sap/m/MessageBox",
    "sap/m/MessageToast"
], function (MessageBox, MessageToast) {
    "use strict";

    function parseCsv(text) {
        const rows = [];
        let row = [];
        let cell = "";
        let quoted = false;

        for (let index = 0; index < text.length; index += 1) {
            const character = text[index];
            if (quoted) {
                if (character === '"' && text[index + 1] === '"') {
                    cell += '"';
                    index += 1;
                } else if (character === '"') {
                    quoted = false;
                } else {
                    cell += character;
                }
            } else if (character === '"' && cell.length === 0) {
                quoted = true;
            } else if (character === ",") {
                row.push(cell.trim());
                cell = "";
            } else if (character === "\n" || character === "\r") {
                if (character === "\r" && text[index + 1] === "\n") {
                    index += 1;
                }
                row.push(cell.trim());
                if (row.some((value) => value !== "")) {
                    rows.push(row);
                }
                row = [];
                cell = "";
            } else {
                cell += character;
            }
        }

        if (quoted) {
            throw new Error("The CSV contains a quoted field that was not closed.");
        }
        row.push(cell.trim());
        if (row.some((value) => value !== "")) {
            rows.push(row);
        }
        return rows;
    }

    return {
        onOpenBulkSuppliers: function () {
            this._openBulkDialog(
                "suppliers",
                "Bulk import suppliers",
                "CSV headers: name,email,country. The name column is required; email and country are optional.",
                "name,email,country\nExample Supplier,contact@example.com,Canada"
            );
        },

        onOpenBulkProducts: function () {
            this._openBulkDialog(
                "products",
                "Bulk import products",
                "CSV headers: name,description,price,supplier_ID. Name, positive price, and an existing supplier ID are required.",
                "name,description,price,supplier_ID\nExample Sensor,Industrial sensor,299.99,sup-001"
            );
        },

        onOpenBulkPurchaseOrders: function () {
            this._openBulkDialog(
                "purchaseOrders",
                "Bulk import purchase orders",
                "CSV headers: orderNumber,supplier_ID,product_ID,quantity. Use one row per item; repeat the order number and supplier for items in the same PO. The item total is calculated from the product price.",
                "orderNumber,supplier_ID,product_ID,quantity\nPO-2026-001,sup-001,prod-001,2"
            );
        },

        _openBulkDialog: function (type, title, help, placeholder) {
            this._model.setProperty("/bulk", {
                type: type,
                title: title,
                help: help,
                placeholder: placeholder,
                text: "",
                result: "",
                saving: false
            });
            this._fragmentControl("bulkImportDialog", "bulkDialog").open();
        },

        onRunBulkImport: async function () {
            const bulk = this._model.getProperty("/bulk");
            let records;
            try {
                const rows = parseCsv(bulk.text);
                if (rows.length < 2) {
                    throw new Error("Paste a CSV header and at least one data row.");
                }
                const headers = rows[0].map((header, index) =>
                    (index === 0 ? header.replace(/^\uFEFF/, "") : header).trim().toLowerCase()
                );
                const requiredHeaders = bulk.type === "products"
                    ? ["name", "price", "supplier_id"]
                    : bulk.type === "purchaseOrders"
                        ? ["ordernumber", "supplier_id", "product_id", "quantity"]
                        : ["name"];
                const missing = requiredHeaders.filter((header) => !headers.includes(header));
                if (missing.length) {
                    throw new Error(`Missing CSV column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}.`);
                }
                records = rows.slice(1).map((cells, rowIndex) => {
                    const record = {};
                    headers.forEach((header, columnIndex) => {
                        record[header] = cells[columnIndex] || "";
                    });
                    return { record: record, line: rowIndex + 2 };
                });
                if (bulk.type === "purchaseOrders") {
                    if (records.some(({ record }) =>
                        !record.ordernumber.trim() || !record.supplier_id.trim() ||
                        !record.product_id.trim() || !record.quantity.trim()
                    )) {
                        throw new Error("Every PO row must include an order number, supplier ID, product ID, and quantity.");
                    }
                } else if (records.some(({ record }) => !record.name.trim())) {
                    throw new Error("Every data row must include a name.");
                }
            } catch (error) {
                MessageBox.error(error.message, { title: "Invalid CSV" });
                return;
            }

            if (bulk.type === "purchaseOrders") {
                await this._importBulkPurchaseOrders(records);
                return;
            }

            const supplierIds = new Set(this._model.getProperty("/suppliers").map((supplier) => supplier.ID));
            const failures = [];
            let created = 0;
            this._model.setProperty("/bulk/saving", true);
            this._model.setProperty("/bulk/result", "");
            try {
                for (const entry of records) {
                    const record = entry.record;
                    let entity;
                    let body;
                    if (bulk.type === "products") {
                        const price = Number(record.price);
                        if (!Number.isFinite(price) || price <= 0) {
                            failures.push(`Line ${entry.line}: price must be greater than zero.`);
                            continue;
                        }
                        if (!supplierIds.has(record.supplier_id)) {
                            failures.push(`Line ${entry.line}: supplier_ID '${record.supplier_id}' was not found.`);
                            continue;
                        }
                        entity = "Products";
                        body = {
                            name: record.name.trim(),
                            description: (record.description || "").trim(),
                            price: price,
                            supplier_ID: record.supplier_id
                        };
                    } else {
                        entity = "Suppliers";
                        body = {
                            name: record.name.trim(),
                            email: (record.email || "").trim(),
                            country: (record.country || "").trim()
                        };
                    }
                    try {
                        await this._api.request(entity, { method: "POST", body: body });
                        created += 1;
                    } catch (error) {
                        failures.push(`Line ${entry.line}: ${error.message}`);
                    }
                }

                const summary = `${created} ${bulk.type} created; ${failures.length} row(s) failed.`;
                this._model.setProperty("/bulk/result", failures.length
                    ? `${summary}\n${failures.join("\n")}`
                    : summary);
                await this._loadData();
                if (!failures.length) {
                    MessageToast.show(summary);
                }
            } finally {
                this._model.setProperty("/bulk/saving", false);
            }
        },

        _importBulkPurchaseOrders: async function (records) {
            const suppliers = this._model.getProperty("/suppliers");
            const products = this._model.getProperty("/products");
            const supplierIds = new Set(suppliers.map((supplier) => supplier.ID));
            const groups = new Map();
            const failures = [];

            records.forEach(({ record, line }) => {
                const orderNumber = record.ordernumber.trim();
                const supplierId = record.supplier_id.trim();
                const productId = record.product_id.trim();
                const quantity = Number(record.quantity);
                const product = products.find((entry) => entry.ID === productId);
                if (!Number.isInteger(quantity) || quantity <= 0) {
                    failures.push(`Line ${line}: quantity must be a positive whole number.`);
                    return;
                }
                if (!supplierIds.has(supplierId)) {
                    failures.push(`Line ${line}: supplier_ID '${supplierId}' was not found.`);
                    return;
                }
                if (!product || product.supplier_ID !== supplierId) {
                    failures.push(`Line ${line}: product_ID '${productId}' was not found for supplier '${supplierId}'.`);
                    return;
                }
                if (!groups.has(orderNumber)) {
                    groups.set(orderNumber, { supplierId: supplierId, lines: [], sourceLine: line });
                }
                const group = groups.get(orderNumber);
                if (group.supplierId !== supplierId) {
                    failures.push(`Line ${line}: PO '${orderNumber}' has more than one supplier.`);
                    return;
                }
                group.lines.push({
                    product_ID: productId,
                    quantity: quantity,
                    itemTotal: Number(product.price) * quantity
                });
            });

            if (!groups.size && failures.length) {
                this._model.setProperty("/bulk/result", failures.join("\n"));
                return;
            }

            let created = 0;
            this._model.setProperty("/bulk/saving", true);
            this._model.setProperty("/bulk/result", "");
            try {
                for (const [orderNumber, group] of groups) {
                    if (!group.lines.length) {
                        continue;
                    }
                    const total = group.lines.reduce((sum, line) => sum + line.itemTotal, 0);
                    try {
                        const draft = await this._api.request("PurchaseOrders", {
                            method: "POST",
                            body: {
                                orderNumber: orderNumber,
                                supplier_ID: group.supplierId,
                                totalAmount: total
                            }
                        });
                        if (!draft || !draft.ID) {
                            throw new Error("The server did not return the new draft ID.");
                        }
                        for (const line of group.lines) {
                            await this._api.request(
                                `PurchaseOrders(ID='${draft.ID}',IsActiveEntity=false)/items`,
                                { method: "POST", body: line }
                            );
                        }
                        await this._api.request(
                            `PurchaseOrders(ID='${draft.ID}',IsActiveEntity=false)/nexus.supply.procurementService.draftActivate`,
                            { method: "POST", body: {} }
                        );
                        created += 1;
                    } catch (error) {
                        failures.push(`PO '${orderNumber}' (line ${group.sourceLine}): ${error.message}`);
                    }
                }
                const summary = `${created} purchase order(s) created; ${failures.length} row/order error(s).`;
                this._model.setProperty("/bulk/result", failures.length
                    ? `${summary}\n${failures.join("\n")}`
                    : summary);
                await this._loadData();
                if (!failures.length) {
                    MessageToast.show(summary);
                }
            } finally {
                this._model.setProperty("/bulk/saving", false);
            }
        },

        onCloseBulk: function () {
            this._fragmentControl("bulkImportDialog", "bulkDialog").close();
        }
    };
});
