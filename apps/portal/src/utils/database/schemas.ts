import {
  CredentialSchema,
  CredentialMetadataSchema,
  DIDSchema,
  KeySchema,
  MessageSchema,
  DIDKeyLinkSchema,
  DIDLinkSchema,
  SettingsSchema,
  IssuanceSchema,
} from "@hyperledger/identus-sdk";

export const schemas = {
  credentials: CredentialSchema,
  "credential-metadata": CredentialMetadataSchema,
  dids: DIDSchema,
  keys: KeySchema,
  messages: MessageSchema,
  "didkey-link": DIDKeyLinkSchema,
  "did-link": DIDLinkSchema,
  settings: SettingsSchema,
  issuance: IssuanceSchema,
};