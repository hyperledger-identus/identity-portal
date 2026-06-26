import { Domain, } from "@hyperledger/identus-sdk";


/**
 * The LocalAgent is temporary, we should design 1 interface that
 * is able to manage the Agent operations from a shared interface.
 * 
 * We can use the localAgent one as an orientation, 
 * the cloudAgent one is just an API Client.
 * 
 * This interface needs to be replaced with a common, unified interface for both modes
 */
export type Agent = {
    start: () => Promise<void>;
    stop: () => Promise<void>;
    dids: {
        resolveDID: (did: string) => ReturnType<Domain.DIDResolver['resolve']>;
        // We need to add create prism did methods, create, publish
    },
    // WE also need to extend these types in order to support additional functionality
    // Credential issuance flows
    // Credential verification flows
};
