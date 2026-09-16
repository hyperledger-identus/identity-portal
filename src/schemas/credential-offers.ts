import { z } from 'zod';

/**
 * Issue Credential 3.0 protocol states as Cloud Agent reports them. Kept in
 * lockstep with `CREDENTIAL_PROTOCOL_STATES` in `src/utils/agent/types.ts`.
 */
export const credentialProtocolStateSchema = z.enum([
  'InvitationGenerated',
  'OfferPending',
  'OfferSent',
  'OfferReceived',
  'RequestPending',
  'RequestGenerated',
  'RequestSent',
  'RequestReceived',
  'CredentialPending',
  'CredentialGenerated',
  'CredentialSent',
  'CredentialReceived',
  'ProblemReportPending',
  'ProblemReportSent',
  'ProblemReportReceived',
  'InvitationExpired',
]);

export const credentialOfferRoleSchema = z.enum(['Issuer', 'Holder']);

/**
 * A connectionless OOB credential offer. `claims` is a JSON object (Cloud
 * Agent shape), not `{ name, value }[]`.
 */
export const credentialOfferRecordSchema = z.object({
  recordId: z.string(),
  thid: z.string(),
  role: credentialOfferRoleSchema,
  protocolState: credentialProtocolStateSchema,
  credentialFormat: z.literal('JWT'),
  claims: z.record(z.unknown()),
  issuingDID: z.string().optional(),
  subjectId: z.string().optional(),
  schemaId: z.string().optional(),
  automaticIssuance: z.boolean().optional(),
  invitationUrl: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
});

/** Body of `POST /api/offers`. JWT only; `automaticIssuance` defaults true. */
export const createOobOfferInputSchema = z.object({
  claims: z.record(z.unknown()),
  issuingDID: z.string().min(1),
  credentialFormat: z.literal('JWT').optional(),
  schemaId: z.string().min(1).optional(),
  automaticIssuance: z.boolean().optional(),
  goalCode: z.string().optional(),
  goal: z.string().optional(),
});

export const credentialOfferListSchema = z.object({
  offers: z.array(credentialOfferRecordSchema),
});

/** Decoded OOB invitation shown before the holder accepts or rejects. */
export const invitationPreviewSchema = z.object({
  from: z.string().optional(),
  goalCode: z.string().optional(),
  goal: z.string().optional(),
  claims: z.record(z.unknown()),
  credentialFormat: z.string(),
  issuingDID: z.string().optional(),
  schemaId: z.string().optional(),
});

export const invitationOobInputSchema = z.object({
  oob: z.string().min(1),
  subjectId: z.string().min(1).optional(),
});

export type CredentialOfferRecordDto = z.infer<typeof credentialOfferRecordSchema>;
export type CreateOobOfferInputDto = z.infer<typeof createOobOfferInputSchema>;
export type InvitationPreviewDto = z.infer<typeof invitationPreviewSchema>;
