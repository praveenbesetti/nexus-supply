sap.ui.define([
    "sap/m/MessageBox",
    "sap/m/MessageToast"
], function (MessageBox, MessageToast) {
    "use strict";

    return {
        onOpenCreateSupplier: function () {
            this._model.setProperty("/newSupplier", { name: "", email: "", country: "" });
            this._fragmentControl("createSupplierDialog", "supplierDialog").open();
        },

        onSaveSupplier: async function () {
            const supplier = this._model.getProperty("/newSupplier");
            if (!supplier.name.trim()) {
                MessageBox.error("Enter a supplier name.");
                return;
            }
            try {
                await this._api.request("Suppliers", {
                    method: "POST",
                    body: {
                        name: supplier.name.trim(),
                        email: supplier.email.trim(),
                        country: supplier.country.trim()
                    }
                });
                this._fragmentControl("createSupplierDialog", "supplierDialog").close();
                MessageToast.show("Supplier added.");
                await this._loadData();
            } catch (error) {
                MessageBox.error(error.message, { title: "Could not add supplier" });
            }
        },

        onCloseSupplier: function () {
            this._fragmentControl("createSupplierDialog", "supplierDialog").close();
        },

        onOpenCreateProduct: function () {
            this._model.setProperty("/newProduct", {
                name: "",
                description: "",
                price: "",
                supplier_ID: ""
            });
            this._fragmentControl("createProductDialog", "productDialog").open();
        },

        onSaveProduct: async function () {
            const product = this._model.getProperty("/newProduct");
            const price = Number(product.price);
            if (!product.name.trim() || !product.supplier_ID || !Number.isFinite(price) || price <= 0) {
                MessageBox.error("Enter a product name, select a supplier, and enter a price greater than zero.");
                return;
            }
            try {
                await this._api.request("Products", {
                    method: "POST",
                    body: {
                        name: product.name.trim(),
                        description: product.description.trim(),
                        price: price,
                        supplier_ID: product.supplier_ID
                    }
                });
                this._fragmentControl("createProductDialog", "productDialog").close();
                MessageToast.show("Product added.");
                await this._loadData();
            } catch (error) {
                MessageBox.error(error.message, { title: "Could not add product" });
            }
        },

        onCloseProduct: function () {
            this._fragmentControl("createProductDialog", "productDialog").close();
        }
    };
});
