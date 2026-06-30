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
  settings: {
    ...SettingsSchema,
    properties: {
      ...SettingsSchema.properties,
      tenantId: {
        type: "string",
        description: "The tenant ID",
      },
    },
  },
  tenants: {
    encrypted: ["tenantId"],
    version: 0,
    primaryKey: "uuid",
    type: "object",
    properties: {
      uuid: {
        type: "string",
      },
      tenantId: {
        type: "string",
      },
    },
  },
  issuance: IssuanceSchema,
};