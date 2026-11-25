import cds from '@sap/cds';

export default class S4SuppliersMock extends cds.ApplicationService {
    async init() {
        this.on('READ', (req) => {
            const where = req.query.SELECT.where ?? []; 
//output        -------------------------------------------
// [
//   { "ref": ["BusinessPartner"] },   // Index 0
//   "=",                              // Index 1
//   { "val": "100050" },              // Index 2
//   "and",                            // Index 3
//   { "ref": ["CorrespondenceLanguage"] }, // Index 4
//   "=",                              // Index 5
//   { "val": "EN" }                   // Index 6
// ]
            console.log(where)
            const businessPartnerIndex = where.findIndex(
                (expression) => expression.ref?.[0] === 'BusinessPartner'
            );
            const businessPartner = where[businessPartnerIndex + 2]?.val;

            if (typeof businessPartner !== 'string') {
                throw new Error('Expected a BusinessPartner filter in the S/4 mock request.');
            }

            if (businessPartner === 'non-existent-sup-999') return null;

            return {
                BusinessPartner: businessPartner,
                BusinessPartnerFullName: 'Test Supplier',
                CorrespondenceLanguage: 'EN',
                OrganizationPostalCode: '00000'
            };
        });

        return super.init();// used to call parent class.
    }
}
