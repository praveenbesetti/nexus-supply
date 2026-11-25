import cds from '@sap/cds';

export default cds.service.impl(async function() {
    
    // Subscribe to the OrderApproved event emitted by the procurement service
    this.on('OrderApproved', async (msg) => {
        const { ID, orderNumber, totalAmount, approvedBy } = msg.data;
        
        console.log(`[Event Consumer] Processing OrderApproved event...`);
        console.log(` -> Order ID: ${ID}`);
        console.log(` -> Order Number: ${orderNumber}`);
        console.log(` -> Total Amount: $${totalAmount}`);
        console.log(` -> Approved By: ${approvedBy}`);
        
        // TODO: Trigger downstream ERP integration, inventory allocation, or ledger entry
    });
});