S/4HANA External Service
========================

Purpose
-------

The files in this folder describe and test the connection to the external
SAP S/4HANA Business Partner API. Purchase-order validation uses this service
to check that a supplied BusinessPartner ID exists.

The external service model
--------------------------

File: s4-suppliers.cds

This CDS model describes the part of the S/4HANA OData API used by this
application:

    namespace external.s4;

    @cds.persistence.skip
    @cds.external
    service S4BusinessPartnerService {
        entity A_BusinessPartner {
            key BusinessPartner : String;
            BusinessPartnerFullName : String;
            CorrespondenceLanguage : String;
            OrganizationPostalCode : String;
        }
    }

`@cds.external` marks this as a remote service, not an API that this
application should expose. `@cds.persistence.skip` prevents CAP from creating
local database tables for the remote entity.

The test mock
-------------

File: s4-suppliers-mock.js

The `test` profile in package.json selects this implementation instead of
calling the real S/4HANA endpoint:

    "S4BusinessPartnerService": {
      "kind": "odata-v2",
      "model": "srv/external/s4-suppliers",
      "[test]": {
        "impl": "srv/external/s4-suppliers-mock.js"
      }
    }

The mock handles reads and returns a sample partner for normal IDs. It returns
no result for `non-existent-sup-999`, allowing the invalid-supplier test to
verify that purchase-order creation is rejected.

    import cds from '@sap/cds';

    export default class S4SuppliersMock extends cds.ApplicationService {
        async init() {
            this.on('READ', (req) => {
                const where = req.query.SELECT.where ?? [];
                const businessPartnerIndex = where.findIndex(
                    (expression) => expression.ref?.[0] === 'BusinessPartner'
                );
                const businessPartner = where[businessPartnerIndex + 2]?.val;

                if (typeof businessPartner !== 'string') {
                    throw new Error(
                        'Expected a BusinessPartner filter in the S/4 mock request.'
                    );
                }

                if (businessPartner === 'non-existent-sup-999') return null;

                return {
                    BusinessPartner: businessPartner,
                    BusinessPartnerFullName: 'Test Supplier',
                    CorrespondenceLanguage: 'EN',
                    OrganizationPostalCode: '00000'
                };
            });

            return super.init();
        }
    }

How the application uses it
----------------------------

`srv/procurement-service.js` connects to `S4BusinessPartnerService` and checks
the actual entity/key from the model:

    const s4 = await cds.connect.to('S4BusinessPartnerService');
    const supplier = await s4.run(
        SELECT.one.from('A_BusinessPartner')
            .where({ BusinessPartner: supplier_ID })
    );

The test mock makes that check deterministic and independent of sandbox
credentials, network availability, or live S/4HANA data. In development the
service uses the configured S/4HANA URL; in production it uses the configured
destination. CAP's built-in `odata-v2` service implementation is used; an old
implementation path that did not exist in the installed CAP version was
removed.
