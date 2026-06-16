import { Domain, type DIDMethod } from "@hyperledger/identus-sdk";


export type ResolverClass = new (apollo: Domain.Apollo) => Domain.DIDResolver;

export function createResolver(
    baseUrl: string
): DIDMethod<never, unknown, never, never, never> {
    const resolver = new class implements Domain.DIDResolver {
        method: string = "prism";

        async resolve(didString: string) {
            const url = baseUrl.replace(/\/$/, "") + "/" + didString;
            const response = await fetch(url, {
                "headers": {
                    "accept": "*/*",
                    "accept-language": "en",
                    "cache-control": "no-cache",
                    "pragma": "no-cache",
                    "sec-gpc": "1"
                },
                "method": "GET",
                "mode": "cors",
                "credentials": "omit"
            })
            if (!response.ok) {
                throw new Error('Failed to fetch data');
            }
            const data = await response.json() as Record<string, unknown>;
            return Domain.DIDDocument.fromJSON({ ...data, id: didString });
        }
    };

    return {
        method: "prism",
        resolver,
        create: async () => {
            throw new Error("Custom PRISM resolver does not implement DID creation.");
        },
        verifySignature: async () => false,
    };
}
