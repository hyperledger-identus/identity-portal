/**
 * @module API
 *
 * ## Per-request API context
 *
 * Builds the {@link Context} handed to every API handler. It runs after
 * {@link requireApiAuth} (so the session token is valid/refreshed) and resolves
 * the agent for the current caller — in cloud mode an HTTP client already
 * authenticated with the user's access token. This is the single place where a
 * request is bound to an agent, which guarantees the remote agent is always
 * used authenticated.
 *
 * @category API
 */
import type { Request, Response } from 'express';
import type { Context } from '../utils/rest';
import { getSession } from '../utils/auth';
import { getRequestAgent } from '../utils/agent';

export async function createRequestContext(
  req: Request,
  res: Response,
): Promise<Context> {
  const session = await getSession(req, res);
  //The tenantId is used to filter the DIDS, credentials and DIDComm messages by userId on the local agent.
  //With CloudAgent, we just use the accessToken.
  const agent = await getRequestAgent({ 
    tenantId: session.sub!, 
    accessToken: session.accessToken 
  });
  await agent.start();
  return { agent };
}
