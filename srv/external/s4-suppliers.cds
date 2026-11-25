namespace external.s4;

// Define the external service model mirroring the remote API
@cds.persistence.skip // Tells CAP not to create local DB tables for this
@cds.external
service S4BusinessPartnerService {
    entity A_BusinessPartner {
        key BusinessPartner : String;
        BusinessPartnerFullName : String;
        CorrespondenceLanguage : String;
        OrganizationPostalCode : String;
    }
}