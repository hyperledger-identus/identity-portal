import { PrismDIDMethod } from "@hyperledger/identus-sdk";
import { RESOLVER_URL } from ".";

export const PRISM_DID_RESOLVERS = [
    new PrismDIDMethod(RESOLVER_URL)
]