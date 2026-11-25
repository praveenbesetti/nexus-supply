sap.ui.define([], function () {
    "use strict";

    return class ProcurementApi {
        constructor(serviceRoot) {
            this._serviceRoot = serviceRoot.replace(/\/$/, "");
            this._authorization = "";
            this._csrfToken = "";
        }

        setBasicAuthorization(value) {
            this._authorization = value;
            this._csrfToken = "";
        }

        clearAuthorization() {
            this._authorization = "";
            this._csrfToken = "";
        }

        async request(path, options) {
            const settings = options || {};
            const method = settings.method || "GET";
            const headers = Object.assign({ Accept: "application/json" }, settings.headers || {});
            if (settings.body !== undefined) {
                headers["Content-Type"] = "application/json";
            }
            if (this._authorization) {
                headers.Authorization = this._authorization;
            }

            if (method !== "GET") {
                await this._fetchCsrfToken();
                if (this._csrfToken) {
                    headers["X-CSRF-Token"] = this._csrfToken;
                }
            }

            const response = await fetch(`${this._serviceRoot}/${path}`, {
                method: method,
                headers: headers,
                credentials: "same-origin",
                body: settings.body === undefined ? undefined : JSON.stringify(settings.body)
            });
            const text = await response.text();
            let result = null;
            if (text) {
                try {
                    result = JSON.parse(text);
                } catch {
                    result = { message: text };
                }
            }

            if (!response.ok) {
                const error = result && result.error;
                const message = error && error.message;
                const detail = typeof message === "string" ? message : message && message.value;
                throw new Error(detail || (result && result.message) || `Request failed (${response.status}).`);
            }
            return result;
        }

        async _fetchCsrfToken() {
            const headers = { "X-CSRF-Token": "Fetch" };
            if (this._authorization) {
                headers.Authorization = this._authorization;
            }
            const response = await fetch(`${this._serviceRoot}/$metadata`, {
                headers: headers,
                credentials: "same-origin"
            });
            if (!response.ok) {
                throw new Error(`Could not prepare the request (${response.status}).`);
            }
            this._csrfToken = response.headers.get("x-csrf-token") || "";
        }
    };
});
