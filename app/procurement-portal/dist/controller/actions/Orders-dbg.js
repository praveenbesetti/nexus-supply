sap.ui.define([
    "sap/m/MessageBox",
    "sap/m/MessageToast"
], function (MessageBox, MessageToast) {
    "use strict";

    return {
        onOpenCreate: function () {
            this._model.setProperty("/newOrder", { orderNumber: "", supplier_ID: "" });
            this._model.setProperty("/draftItems", [this._newDraftItem()]);
            this._model.setProperty("/availableProducts", []);
            this._updateDraftTotal();
            this._fragmentControl("createPurchaseOrderDialog", "createDialog").open();
        },

        _newDraftItem: function () {
            return { product_ID: "", quantity: 1, unitPrice: 0, itemTotal: 0 };
        },

        onSupplierChange: function (event) {
            const supplierId = event.getSource().getSelectedKey();
            const products = this._model.getProperty("/products");
            const available = products.filter((product) => product.supplier_ID === supplierId);
            this._model.setProperty("/newOrder/supplier_ID", supplierId);
            this._model.setProperty("/availableProducts", available);
            const availableIds = new Set(available.map((product) => product.ID));
            const lines = this._model.getProperty("/draftItems");
            lines.forEach((line, index) => {
                if (line.product_ID && !availableIds.has(line.product_ID)) {
                    this._model.setProperty(`/draftItems/${index}/product_ID`, "");
                    this._model.setProperty(`/draftItems/${index}/unitPrice`, 0);
                    this._model.setProperty(`/draftItems/${index}/itemTotal`, 0);
                }
            });
            this._updateDraftTotal();
        },

        onAddLine: function () {
            const lines = this._model.getProperty("/draftItems");
            this._model.setProperty("/draftItems", lines.concat(this._newDraftItem()));
        },

        onRemoveLine: function (event) {
            const context = event.getSource().getBindingContext("vm");
            const path = context.getPath();
            const index = Number(path.substring(path.lastIndexOf("/") + 1));
            const lines = this._model.getProperty("/draftItems").filter((line, lineIndex) => lineIndex !== index);
            this._model.setProperty("/draftItems", lines);
            this._updateDraftTotal();
        },

        onLineProductChange: function (event) {
            const path = event.getSource().getBindingContext("vm").getPath();
            const productId = event.getSource().getSelectedKey();
            const product = this._model.getProperty("/products").find((entry) => entry.ID === productId);
            const unitPrice = product ? Number(product.price) : 0;
            const quantity = Number(this._model.getProperty(`${path}/quantity`) || 0);
            this._model.setProperty(`${path}/product_ID`, productId);
            this._model.setProperty(`${path}/unitPrice`, unitPrice);
            this._model.setProperty(`${path}/itemTotal`, unitPrice * quantity);
            this._updateDraftTotal();
        },

        onItemQuantityChange: function (event) {
            const path = event.getSource().getBindingContext("vm").getPath();
            const quantity = Number(event.getSource().getValue());
            const validQuantity = Number.isInteger(quantity) && quantity > 0 ? quantity : 0;
            const unitPrice = Number(this._model.getProperty(`${path}/unitPrice`) || 0);
            this._model.setProperty(`${path}/quantity`, validQuantity);
            this._model.setProperty(`${path}/itemTotal`, unitPrice * validQuantity);
            this._updateDraftTotal();
        },

        _updateDraftTotal: function () {
            const total = this._model.getProperty("/draftItems")
                .reduce((sum, line) => sum + Number(line.itemTotal || 0), 0);
            this._model.setProperty("/draftTotal", this.formatAmount(total));
        },

        onSavePurchaseOrder: async function () {
            const order = Object.assign({}, this._model.getProperty("/newOrder"), {
                supplier_ID: this._fragmentControl("createPurchaseOrderDialog", "supplierSelect").getSelectedKey()
            });
            const products = this._model.getProperty("/products");
            const lines = this._fragmentControl("createPurchaseOrderDialog", "draftItemsTable")
                .getItems()
                .map((row) => {
                    const cells = row.getCells();
                    const product_ID = cells[0].getSelectedKey();
                    const quantity = Number(cells[1].getValue());
                    const product = products.find((entry) => entry.ID === product_ID);
                    const unitPrice = product ? Number(product.price) : 0;
                    return {
                        product_ID: product_ID,
                        quantity: quantity,
                        unitPrice: unitPrice,
                        itemTotal: unitPrice * quantity
                    };
                });
            this._model.setProperty("/draftItems", lines);
            this._updateDraftTotal();

            if (!order.orderNumber.trim() || !order.supplier_ID) {
                MessageBox.error("Enter an order number and select a supplier.");
                return;
            }
            if (!lines.length || lines.some((line) =>
                !line.product_ID || !Number.isInteger(line.quantity) || line.quantity <= 0
            )) {
                MessageBox.error("Select a product for every line and enter a positive whole-number quantity.");
                return;
            }

            const supplierProducts = new Set(products
                .filter((product) => product.supplier_ID === order.supplier_ID)
                .map((product) => product.ID));
            if (lines.some((line) => !supplierProducts.has(line.product_ID))) {
                MessageBox.error("Each selected product must belong to the chosen supplier.");
                return;
            }

            const total = lines.reduce((sum, line) => sum + line.itemTotal, 0);
            if (total <= 0) {
                MessageBox.error("The order total must be greater than zero.");
                return;
            }

            this._model.setProperty("/saving", true);
            try {
                const created = await this._api.request("PurchaseOrders", {
                    method: "POST",
                    body: {
                        orderNumber: order.orderNumber.trim(),
                        supplier_ID: order.supplier_ID,
                        totalAmount: total
                    }
                });
                if (!created || !created.ID) {
                    throw new Error("The server created the purchase order but did not return its ID.");
                }

                for (const line of lines) {
                    await this._api.request(
                        `PurchaseOrders(ID='${created.ID}',IsActiveEntity=false)/items`,
                        {
                            method: "POST",
                            body: {
                                product_ID: line.product_ID,
                                quantity: line.quantity,
                                itemTotal: line.itemTotal
                            }
                        }
                    );
                }

                await this._api.request(
                    `PurchaseOrders(ID='${created.ID}',IsActiveEntity=false)/nexus.supply.procurementService.draftActivate`,
                    { method: "POST", body: {} }
                );
                this._fragmentControl("createPurchaseOrderDialog", "createDialog").close();
                MessageToast.show("Purchase order created.");
                await this._loadData();
            } catch (error) {
                MessageBox.error(
                    `${error.message}\n\nIf item creation failed, the draft may still exist and can be completed from the API.`,
                    { title: "Could not create purchase order" }
                );
            } finally {
                this._model.setProperty("/saving", false);
            }
        },

        onCloseCreate: function () {
            this._fragmentControl("createPurchaseOrderDialog", "createDialog").close();
        },

        onOpenPurchaseOrder: function (event) {
            const order = event.getSource().getBindingContext("vm").getObject();
            this._model.setProperty("/selectedOrder", order);
            this._model.setProperty("/selectedItems", order.items || []);
            this._fragmentControl("purchaseOrderDetails", "detailsDialog").open();
        },

        onApprovePurchaseOrder: async function () {
            const order = this._model.getProperty("/selectedOrder");
            if (!order.ID) {
                return;
            }
            try {
                await this._api.request(
                    `PurchaseOrders(ID='${order.ID}',IsActiveEntity=true)/nexus.supply.procurementService.approvePO`,
                    { method: "POST", body: {} }
                );
                this._fragmentControl("purchaseOrderDetails", "detailsDialog").close();
                MessageToast.show("Purchase order approved.");
                await this._loadData();
            } catch (error) {
                MessageBox.error(error.message, { title: "Could not approve purchase order" });
            }
        },

        onCloseDetails: function () {
            this._fragmentControl("purchaseOrderDetails", "detailsDialog").close();
        }
    };
});
