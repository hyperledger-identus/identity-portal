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
import { SchemaFieldType } from "@trust0/ridb-core";

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
    type: SchemaFieldType.object,
    properties: {
      uuid: {
        type: SchemaFieldType.string,
      },
      tenantId: {
        type: SchemaFieldType.string,
      },
    },
  },
  issuance: IssuanceSchema,
  schemas: {
    encrypted: ["schema"],
    version: 0,
    primaryKey: "uuid",
    type: SchemaFieldType.object,
    properties: {
      uuid: {
        type: SchemaFieldType.string,
      },
      tenantId: {
        type: SchemaFieldType.string,
        description: "The tenant that owns the schema.",
      },
      name: {
        type: SchemaFieldType.string,
        description: "A human-readable name for the credential schema.",
      },
      version: {
        type: SchemaFieldType.string,
        description:
          "The revision of the credential schema, following semantic versioning.",
      },
      description: {
        type: SchemaFieldType.string,
        description: "A human-readable description of the credential schema.",
      },
      type: {
        type: SchemaFieldType.string,
        description:
          "Resolves to a JSON schema with details about the schema metadata.",
      },
      schema: {
        type: SchemaFieldType.object,
        description:
          "Valid JSON Schema where the Credential Schema data fields are defined.",
        properties: {
          $id: {
            type: SchemaFieldType.string,
          },
          $schema: {
            type: SchemaFieldType.string,
          },
          description: {
            type: SchemaFieldType.string,
          },
          type: {
            type: SchemaFieldType.string,
          },
          properties: {
            type: SchemaFieldType.object,
          },
          required: {
            type: SchemaFieldType.array,
            items: {
              type: SchemaFieldType.string,
            },
          },
          additionalProperties: {
            type: SchemaFieldType.boolean,
          },
        },
      },
      tags: {
        type: SchemaFieldType.array,
        items: {
          type: SchemaFieldType.string,
        },
        description:
          "Tokens that allow to lookup and filter the credential schema records.",
      },
      author: {
        type: SchemaFieldType.string,
        description:
          "DID of the identity which authored the credential schema.",
      },
    },
    required: ["uuid", "name", "version", "type", "schema", "author"],
  },
};