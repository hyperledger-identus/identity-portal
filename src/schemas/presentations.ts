import { z } from 'zod';

/**
 * Present Proof states as Cloud Agent reports them. Kept in lockstep with
 * `PRESENTATION_STATES` in `src/utils/agent/types.ts`.
 */
export const presentationStateSchema = z.enum([
  'RequestPending',
  'RequestSent',
  'RequestReceived',
  'RequestRejected',
  'PresentationPending',
  'PresentationGenerated',
  'PresentationSent',
  'PresentationReceived',
  'PresentationVerified',
  'PresentationVerificationFailed',
  'PresentationAccepted',
  'PresentationRejected',
  'ProblemReportPending',
  'ProblemReportSent',
  'ProblemReportReceived',
  'InvitationGenerated',
  'InvitationReceived',
]);

export const presentationRoleSchema = z.enum(['Verifier', 'Prover']);

/** An OOB presentation request and its result. */
export const presentationRecordSchema = z.object({
  presentationId: z.string(),
  thid: z.string(),
  role: presentationRoleSchema,
  state: presentationStateSchema,
  credentialFormat: z.literal('JWT'),
  claims: z.array(z.string()).optional(),
  trustIssuers: z.array(z.string()).optional(),
  schemaId: z.string().optional(),
  presentedClaims: z.record(z.unknown()).optional(),
  invitationUrl: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
});

/**
 * A claim name. It cannot have ".", "[" or "]": the SDK reads them as steps of
 * the path to the claim.
 */
const claimNameSchema = z
  .string()
  .min(1)
  .regex(/^[^.[\]]+$/, 'A claim name cannot have ".", "[" or "]".');

/**
 * Body of `POST /api/presentations`. JWT only. The request needs at least one
 * claim or one trusted issuer; the route checks it.
 */
export const createOobPresentationRequestInputSchema = z.object({
  claims: z.array(claimNameSchema).optional(),
  trustIssuers: z.array(z.string().min(1)).optional(),
  schemaId: z.string().min(1).optional(),
  credentialFormat: z.literal('JWT').optional(),
  goalCode: z.string().optional(),
  goal: z.string().optional(),
});

export const presentationListSchema = z.object({
  presentations: z.array(presentationRecordSchema),
});

export type PresentationRecordDto = z.infer<typeof presentationRecordSchema>;
export type CreateOobPresentationRequestInputDto = z.infer<
  typeof createOobPresentationRequestInputSchema
>;
