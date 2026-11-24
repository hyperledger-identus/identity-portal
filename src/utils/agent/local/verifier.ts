import { randomUUID } from 'node:crypto';
import {
  Domain,
  type Agent as LocalAgent,
  type CollectionMap,
} from '@hyperledger/identus-sdk';
import { CreateOOBPresentationRequest } from '@hyperledger/identus-sdk/plugins/didcomm';
import { RequestPresentation } from '@hyperledger/identus-sdk/plugins/oea';

import type {
  Agent,
  CreateOobPresentationRequestInput,
  PresentationRecord,
  PresentationRole,
  PresentationState,
} from '../types';
import type { MultiTenantPluto } from './database';
import { ridbTimestampToIso } from './issuer';
import {
  PRESENTATION_DEFINITION_FORMAT,
  buildPresentationRequest,
} from './presentation-request';

export type LocalVerifierDeps = {
  pluto: MultiTenantPluto;
  agent: LocalAgent;
  tenantId: string;
};

/**
 * Verifier-only view of a stored presentation row. Holder rows will share the
 * collection, so they must not come back from `listRequests` / `getRequest`.
 */
function toVerifierRecord(
  row: CollectionMap['presentations'],
): PresentationRecord | undefined {
  if (row.role !== 'Verifier') {
    return undefined;
  }
  return {
    presentationId: row.uuid,
    thid: row.thid,
    role: row.role as PresentationRole,
    state: row.state as PresentationState,
    credentialFormat: 'JWT',
    claims: row.claims ?? [],
    trustIssuers: row.trustIssuers?.length ? row.trustIssuers : undefined,
    schemaId: row.schemaId,
    invitationUrl: row.invitationUrl,
    createdAt: ridbTimestampToIso(row.createdAt),
    updatedAt: row.updatedAt !== undefined ? ridbTimestampToIso(row.updatedAt) : undefined,
  };
}

/**
 * Verifier namespace for the in-process SDK agent (phase 6, #108). Creates a
 * connectionless OOB presentation request and keeps it; the holder answers
 * later, to the tenant host DID.
 */
export function createLocalVerifier(deps: LocalVerifierDeps): Agent['verifier'] {
  const { pluto, agent, tenantId } = deps;

  return {
    presentations: {
      createOobRequest: async (
        input: CreateOobPresentationRequestInput,
      ): Promise<PresentationRecord> => {
        // The holder sends the presentation to `from`, so it must be the tenant
        // host peer DID (mediator-routed), like `OfferCredential.from` for offers.
        const mediators = await pluto.getAllMediators();
        const hostDid = mediators[0]?.hostDID;
        if (!hostDid) {
          throw new Error(
            'No mediator host DID. Sign out and in again so the tenant can be provisioned.',
          );
        }

        const claims = input.claims ?? [];
        const trustIssuers = input.trustIssuers ?? [];
        const request = buildPresentationRequest(
          { claims, trustIssuers, domain: hostDid.toString() },
          randomUUID,
        );
        const attachment = Domain.AttachmentDescriptor.build(
          { json: request },
          randomUUID(),
          'application/json',
          undefined,
          PRESENTATION_DEFINITION_FORMAT,
        );

        // The holder is not known yet. When it accepts the invitation, the SDK
        // replaces `to` with the holder's new peer DID, so nothing is set here.
        const thid = randomUUID();
        const presentationRequest = new RequestPresentation(
          {},
          [attachment],
          hostDid,
          undefined as unknown as Domain.DID,
          thid,
        );

        // CreateOOBPresentationRequest only base64-encodes the invitation JSON.
        // It does not send DIDComm; the holder gets this out of band.
        const oob = await agent.runTask(
          new CreateOOBPresentationRequest({
            from: hostDid,
            presentationRequest,
            goalCode: input.goalCode,
            goal: input.goal,
          }),
        );
        const invitationUrl = `/oob?_oob=${encodeURIComponent(oob)}`;

        const presentationId = randomUUID();
        await pluto.insertPresentation({
          uuid: presentationId,
          tenantId,
          thid,
          role: 'Verifier',
          state: 'InvitationGenerated',
          credentialFormat: 'JWT',
          claims,
          trustIssuers,
          ...(input.schemaId ? { schemaId: input.schemaId } : {}),
          request: JSON.stringify(request),
          invitationUrl,
          // The schema object is not `as const`, so the Doc type sees
          // `required: false` as `boolean` and marks every field as required.
          // The schema itself keeps these fields optional.
        } as Omit<CollectionMap['presentations'], 'createdAt' | 'updatedAt'>);

        const stored = await pluto.getPresentation(presentationId);
        const record = stored ? toVerifierRecord(stored) : undefined;
        if (!record) {
          throw new Error(`Presentation record ${presentationId} was not stored`);
        }
        return record;
      },

      listRequests: async (
        offset: number,
        limit: number,
      ): Promise<PresentationRecord[]> => {
        const rows = await pluto.listPresentations(offset, limit, 'Verifier');
        return rows.flatMap((row) => {
          const record = toVerifierRecord(row);
          return record ? [record] : [];
        });
      },

      getRequest: async (
        presentationId: string,
      ): Promise<PresentationRecord | undefined> => {
        const row = await pluto.getPresentation(presentationId);
        return row ? toVerifierRecord(row) : undefined;
      },
    },
  };
}
