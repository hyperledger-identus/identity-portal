import {
  CredentialMigration,
  KeyMigration,
  MessageMigration,
} from "@hyperledger/identus-sdk";


export const migrations = {
  credentials: CredentialMigration,
  keys: KeyMigration,
  messages: MessageMigration,
  "credential-metadata": {},
  dids: {},
  "didkey-link": {},
  "did-link": {},
  settings: {},
  issuance: {},
  tenants: {},
};