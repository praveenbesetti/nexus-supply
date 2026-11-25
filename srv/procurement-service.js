import cds from '@sap/cds';

export default class procurementService extends cds.ApplicationService {
    async init() {

        // Connect to the external S/4HANA service declared in package.json
        const s4 = await cds.connect.to('S4BusinessPartnerService');

        // ==========================================
        // 1. BEFORE HOOK: Validation & External Check
        // ==========================================
        const validatePurchaseOrder = async (req) => {
            const { totalAmount, items, supplier_ID } = req.data;

            if (totalAmount !== undefined && totalAmount <= 0) {
                return req.reject(400, 'Purchase Order total amount must be greater than zero.');
            }

            if (items && Array.isArray(items) && items.length === 0) {
                return req.reject(400, 'A Purchase Order must contain at least one line item.');
            }

            
            // Verify supplier exists in the external S/4HANA system if supplier_ID is provided
            if (supplier_ID) {
                let supplierExists;
                try {
                    supplierExists = await s4.run(
                        SELECT.one.from('A_BusinessPartner').where({ BusinessPartner: supplier_ID })
                    );
                } catch (error) {
                    return req.reject(502, `External S/4HANA Service Error: ${error.message}`);
                }

                if (!supplierExists) {
                    return req.reject(400, `Validation Failed: Supplier ID '${supplier_ID}' does not exist in S/4HANA.`);
                }
            }
        };

        this.before('CREATE', 'PurchaseOrders', validatePurchaseOrder);
        this.before(['NEW', 'CREATE'], 'PurchaseOrders.drafts', validatePurchaseOrder);

        this.on('canApprovePurchaseOrders', (req) =>
            req.user.is('ProcurementManager')
        );

        // ==========================================
        // 2. BOUND ACTION HANDLER: Approve PO & Emit Event
        // ==========================================
        this.on('approvePO', ['PurchaseOrders', 'PurchaseOrders.drafts'], async (req) => {
            if (!req.user.is('ProcurementManager')) {
                return req.reject(403, 'Access Denied: Only users with the ProcurementManager role can approve purchase orders.');
            }

            const ID = typeof req.params[0] === 'object' ? req.params[0].ID : req.params[0];
            
            const po = await SELECT.one.from(req.target).where({ ID });
            if (!po) return req.error(404, 'Purchase Order not found.');

            await UPDATE(req.target).set({ status: 'Approved' }).where({ ID });
            
            await this.emit('OrderApproved', {
                ID: po.ID,
                orderNumber: po.orderNumber,
                totalAmount: po.totalAmount,
                approvedBy: req.user.id
            });

            return SELECT.one.from(req.target).where({ ID });
        });

        return super.init();
    }
}