# Known Gaps

This repository is bootstrapped from the mentorship issue and the
`hyperledger-identus/sdk-ts#521` `@hyperledger/identus-react` WIP package. The
following gaps should become backlog issues before mentee implementation starts.

## SDK Integration

- `IssuerProvider.issueCredential` in `@hyperledger/identus-react` depended on
  an SDK-internal `RunProtocol` class that is not exported by
  `@hyperledger/identus-sdk@8.0.0`. The method now fails explicitly until the
  SDK exposes a public credential-issue task or the provider is rewritten around
  public DIDComm APIs.
- The custom PRISM resolver hook had to change from a resolver-constructor API
  to the SDK v8 `DIDMethod` shape. Creation/publish/update/deactivate still need
  first-class PRISM implementations rather than resolver-only wrappers.
- The React package still carries hook dependency warnings inherited from the WIP
  PR. Those should be handled before relying on long-running agent state in the
  portal.

## Portal Product Surface

- Routing is not implemented yet.
- Cloud Agent REST coverage is only a boundary stub.
- CIP-30 wallet wiring is not implemented yet.
- DID publish/update/deactivate flows need concrete Edge Agent and Cloud Agent
  adapters.
- QR/OOB UX, schemas, connection details, and credential presentation flows are
  not yet implemented in the app.

## Local Services

- The compose helper uses upstream image defaults and should be smoke-tested in
  CI once image pulls are acceptable for the repository.
- Cloud Agent support for NeoPRISM should be validated against a pinned released
  image tag before replacing `latest`.
- Health checks exist, but seed data and example DID/credential flows are not
  wired into the local stack yet.
