sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "com/nexussupply/procurementportal/service/ProcurementApi",
    "com/nexussupply/procurementportal/controller/actions/Orders",
    "com/nexussupply/procurementportal/controller/actions/Catalog",
    "com/nexussupply/procurementportal/controller/actions/BulkImport"
], function (Controller, JSONModel, Filter, MessageBox, MessageToast, ProcurementApi, OrderActions, CatalogActions, BulkImportActions) {
    "use strict";

    const SERVICE_ROOT = "/procurement";

    const appMethods = {
        onInit: function () {
            this._api = new ProcurementApi(SERVICE_ROOT);
            this._model = new JSONModel({
                purchaseOrders: [],
                suppliers: [],
                products: [],
                availableProducts: [],
                draftItems: [],
                selectedItems: [],
                selectedOrder: {},
                canApprovePurchaseOrders: false,
                newOrder: { orderNumber: "", supplier_ID: "" },
                newSupplier: { name: "", email: "", country: "" },
                newProduct: { name: "", description: "", price: "", supplier_ID: "" },
                bulk: {
                    type: "",
                    title: "",
                    help: "",
                    placeholder: "",
                    text: "",
                    result: "",
                    saving: false
                },
                draftTotal: "0.00",
                saving: false,
                loadError: "",
                metrics: {
                    orderCount: 0,
                    pendingCount: 0,
                    supplierCount: 0,
                    productCount: 0
                }
            });
            this._model.setDefaultBindingMode("TwoWay");
            this.getView().setModel(this._model, "vm");
            this._loadData();
        },

        _loadData: async function () {
            this._model.setProperty("/loadError", "");
            try {
                const results = await Promise.all([
                    this._api.request("PurchaseOrders?$expand=supplier,items($expand=product)&$orderby=createdAt%20desc"),
                    this._api.request("Suppliers?$orderby=name"),
                    this._api.request("Products?$expand=supplier&$orderby=name"),
                    this._api.request("canApprovePurchaseOrders()")
                ]);
                const orders = results[0].value || [];
                const suppliers = results[1].value || [];
                const products = results[2].value || [];
                const authorization = results[3];
                const canApprove = typeof authorization === "boolean"
                    ? authorization
                    : authorization && authorization.value;
                if (typeof canApprove !== "boolean") {
                    throw new Error("Could not determine whether the current user can approve purchase orders.");
                }
                this._model.setProperty("/purchaseOrders", orders);
                this._model.setProperty("/suppliers", suppliers);
                this._model.setProperty("/products", products);
                this._model.setProperty("/canApprovePurchaseOrders", canApprove);
                this._model.setProperty("/metrics", {
                    orderCount: orders.length,
                    pendingCount: orders.filter((order) =>
                        order.status !== "Approved" && order.status !== "Rejected"
                    ).length,
                    supplierCount: suppliers.length,
                    productCount: products.length
                });
            } catch (error) {
                this._model.setProperty(
                    "/loadError",
                    `${error.message} Check the CAP server and your sign-in, then refresh.`
                );
            }
        },

        onRefresh: function () {
            this._loadData();
        },

        onSearchOrders: function (event) {
            this._filterTable("purchaseOrdersFragment", "ordersTable", ["orderNumber", "status", "supplier/name"], event);
        },

        onSearchSuppliers: function (event) {
            this._filterTable("suppliersFragment", "suppliersTable", ["name", "email", "country"], event);
        },

        onSearchProducts: function (event) {
            this._filterTable("productsFragment", "productsTable", ["name", "description", "supplier/name"], event);
        },

        _filterTable: function (fragmentId, tableId, paths, event) {
            const query = event.getParameter("newValue").trim().toLowerCase();
            const binding = this._fragmentControl(fragmentId, tableId).getBinding("items");
            if (!query) {
                binding.filter([]);
                return;
            }
            const matches = (value) => String(value || "").toLowerCase().includes(query);
            binding.filter(new Filter({
                filters: paths.map((path) => new Filter({ path: path, test: matches })),
                and: false
            }));
        },

        _fragmentControl: function (fragmentId, controlId) {
            return this.byId(`${fragmentId}--${controlId}`);
        },

        onOpenSignIn: function () {
            this._fragmentControl("signInDialogFragment", "signInDialog").open();
        },

        onSignIn: async function () {
            const username = this._fragmentControl("signInDialogFragment", "usernameInput").getValue().trim();
            const passwordInput = this._fragmentControl("signInDialogFragment", "passwordInput");
            const password = passwordInput.getValue();
            if (!username || !password) {
                MessageBox.error("Enter both a username and password.");
                return;
            }

            this._api.setBasicAuthorization(`Basic ${btoa(`${username}:${password}`)}`);
            try {
                await this._api.request("Suppliers?$top=1");
                passwordInput.setValue("");
                this._fragmentControl("signInDialogFragment", "signInDialog").close();
                MessageToast.show("Signed in for this browser session.");
                await this._loadData();
            } catch (error) {
                this._api.clearAuthorization();
                MessageBox.error(error.message, { title: "Sign-in failed" });
            }
        },

        onCloseSignIn: function () {
            this._fragmentControl("signInDialogFragment", "signInDialog").close();
        },

        formatAmount: function (value) {
            const amount = Number(value || 0);
            return new Intl.NumberFormat(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }).format(amount);
        },

        formatDate: function (value) {
            if (!value) {
                return "";
            }
            const date = new Date(value);
            return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat().format(date);
        },

        formatStatusState: function (status) {
            switch (status) {
                case "Approved":
                    return "Success";
                case "Rejected":
                    return "Error";
                case "Submitted":
                    return "Information";
                default:
                    return "Warning";
            }
        }
    };

    return Controller.extend(
        "com.nexussupply.procurementportal.controller.App",
        Object.assign({}, appMethods, OrderActions, CatalogActions, BulkImportActions)
    );
});
