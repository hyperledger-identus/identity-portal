import { Apollo, Castor, Domain, Pluto } from "@hyperledger/identus-sdk";


export async function createHostPeerDID(options: { tenantId: string, mediatorDID: string, apollo: Apollo, castor: Castor, pluto: Pluto }): Promise<Domain.DID> {
    const { mediatorDID, apollo, castor, pluto, tenantId } = options;

    const keyAgreementPrivateKey = apollo.createPrivateKey({
        type: Domain.KeyTypes.Curve25519,
        curve: Domain.Curve.X25519,
    });

    const authenticationPrivateKey = apollo.createPrivateKey({
        type: Domain.KeyTypes.EC,
        curve: Domain.Curve.ED25519,
    });

    const did = await castor.createDID(
        'peer',
        {
            services: [
                new Domain.DIDDocument.Service(
                    "#didcomm-1",
                    ["DIDCommMessaging"],
                    new Domain.DIDDocument.ServiceEndpoint(mediatorDID.toString())
                )
            ],
            keys: {
                KEY_AGREEMENT_KEY: [keyAgreementPrivateKey],
                AUTHENTICATION_KEY: [authenticationPrivateKey],
            }
        }
    );

    await pluto.storeDID(did, [
        keyAgreementPrivateKey,
        authenticationPrivateKey,
    ], `HostDID-${tenantId}`);

    return did;
}