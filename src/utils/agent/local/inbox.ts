import { randomUUID } from 'node:crypto';
import {
  Domain,
  JWTCredential,
  type Agent as LocalAgent,
  type CollectionMap,
} from '@hyperledger/identus-sdk';
import {
  IssueCredential,
  OfferCredential,
  ProblemReport,
  RequestCredential,
} from '@hyperledger/identus-sdk/plugins/didcomm';

import type {
  CredentialOfferRole,
  CredentialProtocolState,
} from '../types';
import type { MultiTenantPluto } from './database';

/**
 * Portal columns on the RIDB `issuance` collection. SDK `CollectionMap['issuance']`
 * only types id / claims / format / issuingDID, so extras are read through this
 * shape after a cast.
 */
type PortalIssuance = CollectionMap['issuance'] & {
  thid?: string;
  role?: CredentialOfferRole;
  protocolState?: string;
  subjectId?: string;
  automaticIssuance?: boolean;
};

/** Holder states that still precede OfferReceived. */
const OFFER_EARLIER_STATES = new Set<string>([
  'InvitationGenerated',
  'OfferPending',
  'OfferSent',
]);

function asPortalIssuance(
  row: CollectionMap['issuance'] | undefined,
): PortalIssuance | undefined {
  return row as PortalIssuance | undefined;
}

function messageRead(
  message: Domain.Message,
  row: CollectionMap['messages'] | undefined,
): boolean {
  const flagged = (message as Domain.Message & { read?: boolean }).read;
  if (flagged === true || row?.read === true) {
    return true;
  }
  return false;
}

async function markMessageRead(
  pluto: MultiTenantPluto,
  row: CollectionMap['messages'] | undefined,
): Promise<void> {
  if (!row || row.read === true) {
    return;
  }
  await pluto.store.update('messages', { ...row, read: true });
}

async function setProtocolState(
  pluto: MultiTenantPluto,
  issuance: PortalIssuance,
  protocolState: CredentialProtocolState,
): Promise<void> {
  if (issuance.protocolState === protocolState) {
    return;
  }
  await pluto.updateIssuance(issuance.id, {
    protocolState,
  } as Partial<CollectionMap['issuance']>);
  issuance.protocolState = protocolState;
}

function asIssueCredential(value: unknown): IssueCredential | undefined {
  if (value instanceof IssueCredential) {
    return value;
  }
  if (value instanceof Domain.Message && value.piuri === IssueCredential.type) {
    return IssueCredential.fromMessage(value);
  }
  return undefined;
}

function claimsObject(
  claims: CollectionMap['issuance']['claims'],
): Record<string, unknown> {
  const subject: Record<string, unknown> = {};
  for (const claim of claims) {
    if (claim.type === 'number') {
      subject[claim.name] = Number(claim.value);
    } else if (claim.type === 'boolean') {
      subject[claim.name] = claim.value === 'true';
    } else if (claim.type === 'date') {
      subject[claim.name] = new Date(claim.value);
    } else {
      subject[claim.name] = claim.value;
    }
  }
  return subject;
}

async function sentIssueExists(
  pluto: MultiTenantPluto,
  thid: string | undefined,
): Promise<boolean> {
  if (!thid) {
    return false;
  }
  const messages = await pluto.getAllMessages();
  return messages.some(
    (message) =>
      message.piuri === IssueCredential.type &&
      message.thid === thid &&
      message.direction === Domain.MessageDirection.SENT,
  );
}

function canonicalPrismDid(did: string): string {
  const [schema, method, rest] = did.split(':');
  if (!schema || !method || !rest) {
    return did;
  }
  return `${schema}:${method}:${rest.split(':')[0]}`;
}

/**
 * JWT.signWithDID resolves the DID through Castor. Short-form published Prism
 * DIDs need the ledger; the tenant store already has the long-form string,
 * which Castor can expand without a resolver.
 */
async function signingDidFromIssuance(
  pluto: MultiTenantPluto,
  issuingDID: string,
): Promise<Domain.DID> {
  const canonical = canonicalPrismDid(issuingDID);
  const rows = await pluto.getPaginatedPrismDIDs(0, 100);
  const match = rows.find((row) => canonicalPrismDid(row.uuid) === canonical);
  if (match?.uuid) {
    return Domain.DID.fromString(match.uuid);
  }
  return Domain.DID.fromString(issuingDID);
}

/**
 * `agent.handle(request-credential)` only passes `{ message }`. The DIDComm
 * JWT issuer task needs format / claims / issuerDID / holderDID, so handle()
 * throws `Not implemented`. Re-run that task with the issuance row filled in.
 */
async function issueViaJwtPlugin(
  agent: LocalAgent,
  pluto: MultiTenantPluto,
  message: Domain.Message,
  issuance: PortalIssuance,
): Promise<IssueCredential | undefined> {
  const Handler = agent.plugins.findProtocol('message', RequestCredential.type);
  if (!Handler) {
    return undefined;
  }
  const issuerDID = await signingDidFromIssuance(pluto, issuance.issuingDID);
  const holderDID =
    issuance.subjectId != null && issuance.subjectId !== ''
      ? Domain.DID.fromString(issuance.subjectId)
      : message.from;
  try {
    const result: unknown = await agent.runTask(
      new Handler({
        message,
        format: Domain.CredentialType.JWT,
        claims: issuance.claims,
        issuerDID,
        holderDID,
      }),
    );
    return asIssueCredential(result);
  } catch {
    return undefined;
  }
}

/**
 * Last-resort JWT VC: same payload the DIDComm issuer task signs, wrapped in
 * Issue Credential 3.0 so we can `sendMessage` it ourselves.
 */
async function issueCredentialFallback(
  agent: LocalAgent,
  pluto: MultiTenantPluto,
  message: Domain.Message,
  issuance: PortalIssuance,
): Promise<IssueCredential> {
  if (!message.from) {
    throw new Error('request-credential has no holder DID');
  }
  // Sign with the stored long-form Prism DID so Castor need not hit the ledger.
  // JWT `iss` stays the canonical issuing DID. DIDComm `from` is the host peer.
  const issuerDID = await signingDidFromIssuance(pluto, issuance.issuingDID);
  const subjectDid =
    issuance.subjectId != null && issuance.subjectId !== ''
      ? issuance.subjectId
      : message.from.toString();
  const now = Math.floor(Date.now() / 1000);
  const jwt = await agent.runtimeContext.JWT.signWithDID(issuerDID, {
    iss: canonicalPrismDid(issuance.issuingDID),
    iat: now,
    exp: now + 60 * 60 * 24 * 365,
    nbf: now,
    jti: randomUUID(),
    sub: subjectDid,
    vc: {
      '@context': ['https://www.w3.org/2018/credentials/v1'],
      type: ['VerifiableCredential'],
      credentialSubject: {
        id: subjectDid,
        ...claimsObject(issuance.claims),
      },
    },
  } as never);

  const attachment = Domain.AttachmentDescriptor.build(
    jwt,
    undefined,
    'application/jwt',
    undefined,
    Domain.CredentialType.JWT,
  );
  return new IssueCredential(
    {},
    [attachment],
    message.to ?? issuerDID,
    message.from,
    message.thid,
  );
}

function issuedJwtIsStoreable(issued: IssueCredential): boolean {
  for (const attachment of issued.attachments) {
    const payload = attachment.payload;
    if (typeof payload !== 'string') {
      continue;
    }
    try {
      JWTCredential.fromJWS(payload);
      return true;
    } catch {
      continue;
    }
  }
  return false;
}

async function sendIssuedCredential(
  agent: LocalAgent,
  issued: IssueCredential,
): Promise<void> {
  await agent.sendMessage(issued.makeMessage());
}

/**
 * Try `agent.handle` first (JWT plugin may issue). It does not send. If no
 * credential was produced or sent, build `IssueCredential` and `sendMessage`.
 */
async function issueAndSendCredential(
  agent: LocalAgent,
  pluto: MultiTenantPluto,
  message: Domain.Message,
  issuance: PortalIssuance,
): Promise<void> {
  const thid = message.thid ?? issuance.thid;
  if (await sentIssueExists(pluto, thid)) {
    return;
  }

  let issued: IssueCredential | undefined;
  try {
    issued = asIssueCredential(await agent.handle(message));
  } catch {
    issued = undefined;
  }

  if (!issued) {
    issued = await issueViaJwtPlugin(agent, pluto, message, issuance);
  }
  // SDK createJWT only sets vc.credentialSubject. processIssuedCredentialMessage
  // requires @context and type, so drop that JWT and use the portal payload.
  if (issued && !issuedJwtIsStoreable(issued)) {
    issued = undefined;
  }
  if (!issued) {
    issued = await issueCredentialFallback(agent, pluto, message, issuance);
  }
  if (!issuedJwtIsStoreable(issued)) {
    throw new Error('Issued JWT is not a storeable W3C credential');
  }

  if (await sentIssueExists(pluto, thid)) {
    return;
  }
  if (message.to && issued.from?.toString() !== message.to.toString()) {
    issued = new IssueCredential(
      issued.body,
      issued.attachments,
      message.to,
      issued.to,
      issued.thid,
    );
  }
  await sendIssuedCredential(agent, issued);
}

async function credentialAlreadyStored(
  agent: LocalAgent,
  issued: IssueCredential,
): Promise<boolean> {
  const stored = await agent.verifiableCredentials();
  const ids = new Set(stored.map((credential) => credential.id));
  for (const attachment of issued.attachments) {
    try {
      const payload = attachment.payload;
      if (typeof payload !== 'string') {
        continue;
      }
      const credential = JWTCredential.fromJWS(payload);
      if (ids.has(credential.id)) {
        return true;
      }
    } catch {
      continue;
    }
  }
  return false;
}

async function handleRequestCredential(
  agent: LocalAgent,
  pluto: MultiTenantPluto,
  message: Domain.Message,
): Promise<void> {
  const thid = message.thid ?? message.id;
  const issuance = asPortalIssuance(await pluto.getIssuanceByThid(thid, 'Issuer'));
  if (!issuance || issuance.role !== 'Issuer') {
    return;
  }

  if (issuance.protocolState !== 'CredentialSent') {
    await setProtocolState(pluto, issuance, 'RequestReceived');
  }

  if (issuance.automaticIssuance === false) {
    return;
  }
  if (issuance.protocolState === 'CredentialSent') {
    return;
  }

  await issueAndSendCredential(agent, pluto, message, issuance);
  await setProtocolState(pluto, issuance, 'CredentialSent');
}

async function handleIssueCredential(
  agent: LocalAgent,
  pluto: MultiTenantPluto,
  message: Domain.Message,
): Promise<void> {
  const issued = IssueCredential.fromMessage(message);
  const thid = message.thid ?? issued.thid ?? message.id;
  const issuance = asPortalIssuance(await pluto.getIssuanceByThid(thid, 'Holder'));
  const alreadyReceived = issuance?.protocolState === 'CredentialReceived';
  const alreadyStored = await credentialAlreadyStored(agent, issued);

  if (!alreadyReceived && !alreadyStored) {
    try {
      await agent.processIssuedCredentialMessage(issued);
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      if (/@context|Invalid vc/i.test(text)) {
        console.error(
          `[process-messages] skipping malformed issue-credential id=${message.id}:`,
          text,
        );
        return;
      }
      throw error;
    }
  }

  if (issuance) {
    await setProtocolState(pluto, issuance, 'CredentialReceived');
  }
}

async function handleOfferCredential(
  pluto: MultiTenantPluto,
  message: Domain.Message,
): Promise<void> {
  const thid = message.thid ?? message.id;
  const issuance = asPortalIssuance(await pluto.getIssuanceByThid(thid, 'Holder'));
  if (!issuance || issuance.role !== 'Holder') {
    return;
  }
  const current = issuance.protocolState;
  if (current && !OFFER_EARLIER_STATES.has(current)) {
    return;
  }
  await setProtocolState(pluto, issuance, 'OfferReceived');
}

async function handleProblemReport(
  pluto: MultiTenantPluto,
  message: Domain.Message,
): Promise<void> {
  const thid = message.thid ?? message.pthid ?? message.id;
  const issuance = asPortalIssuance(await pluto.getIssuanceByThid(thid));
  if (!issuance) {
    return;
  }
  await setProtocolState(pluto, issuance, 'ProblemReportReceived');
}

function isProblemReport(piuri: string): boolean {
  return piuri === ProblemReport.type || piuri.includes('report-problem');
}

/**
 * Same-tenant OOB (issuer and holder share Pluto): sendMessage stores SENT
 * and the mediator may never deliver a RECEIVED copy. If the other role's
 * issuance row exists, treat the outbound message as the inbox event.
 * Two-tenant traffic is unchanged — each store only has one role per thid.
 */
async function shouldProcessSentLoopback(
  pluto: MultiTenantPluto,
  message: Domain.Message,
): Promise<boolean> {
  const thid = message.thid ?? message.id;
  if (message.piuri === RequestCredential.type) {
    const issuance = asPortalIssuance(await pluto.getIssuanceByThid(thid, 'Issuer'));
    return issuance?.role === 'Issuer';
  }
  if (message.piuri === IssueCredential.type) {
    const issuance = asPortalIssuance(await pluto.getIssuanceByThid(thid, 'Holder'));
    return issuance?.role === 'Holder';
  }
  return false;
}

async function dispatchMessage(
  agent: LocalAgent,
  pluto: MultiTenantPluto,
  message: Domain.Message,
): Promise<void> {
  const { piuri } = message;
  if (piuri === RequestCredential.type) {
    await handleRequestCredential(agent, pluto, message);
    return;
  }
  if (piuri === IssueCredential.type) {
    await handleIssueCredential(agent, pluto, message);
    return;
  }
  if (piuri === OfferCredential.type) {
    // Do not agent.handle: that would auto-build request-credential and fight reject.
    await handleOfferCredential(pluto, message);
    return;
  }
  if (isProblemReport(piuri)) {
    await handleProblemReport(pluto, message);
  }
}

/**
 * Advance issuance state and store holder VCs from Pluto DIDComm messages.
 * Idempotent: already-read messages and already-stored credentials are skipped.
 */
export async function processTenantMessages(
  agent: LocalAgent,
  pluto: MultiTenantPluto,
): Promise<void> {
  const messages = await pluto.getAllMessages();
  const storedRows = await pluto.store.query('messages');
  const storedById = new Map(storedRows.map((row) => [row.id, row]));

  for (const message of messages) {
    const row = storedById.get(message.id);
    if (messageRead(message, row)) {
      continue;
    }
    if (message.direction !== Domain.MessageDirection.RECEIVED) {
      if (!(await shouldProcessSentLoopback(pluto, message))) {
        await markMessageRead(pluto, row);
        continue;
      }
    }

    try {
      await dispatchMessage(agent, pluto, message);
      await markMessageRead(pluto, row);
    } catch (error) {
      console.error(
        `[process-messages] failed piuri=${message.piuri} id=${message.id}:`,
        error,
      );
    }
  }
}
