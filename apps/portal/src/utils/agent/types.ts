import { Domain, RequiredPrismDIDSecretKeys} from "@hyperledger/identus-sdk";


/**
 * The LocalAgent is temporary, we should design 1 interface that
 * is able to manage the Agent operations from a shared interface.
 * 
 * We can use the localAgent one as an orientation, 
 * the cloudAgent one is just an API Client.
 * 
 * This interface needs to be replaced with a common, unified interface for both modes
 */


//master key is ignored because MASTER_KEY is always required
export type PrismDIDKeys = Exclude<keyof RequiredPrismDIDSecretKeys, 'MASTER_KEY'>;

export type PrismDIDKeyCurves = {
    [K in PrismDIDKeys]: Domain.Curve[]
}

export type Agent = {
    start: () => Promise<void>;
    stop: () => Promise<void>;
    dids: {
        resolveDID: (did: string) => ReturnType<Domain.DIDResolver['resolve']>;
        prism: {
            create: (keys: PrismDIDKeyCurves) => Promise<Domain.DID>;
            publish: (did: Domain.DID) => Promise<{did: Domain.DID, txId: string}>;
            deactivate: (did: Domain.DID) => Promise<{ txId: string}>
        }
    },
};
