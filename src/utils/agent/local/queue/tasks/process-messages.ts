/**
 * @module Utils
 *
 * ## Tenant DIDComm inbox task
 *
 * A repeatable per-tenant task that dispatches Issue Credential 3.0 messages
 * already stored in Pluto (by fetch-messages) so issuer and holder protocol
 * state can advance and holder VCs are persisted.
 *
 * @category Utils
 */
import { Apollo, Castor } from '@hyperledger/identus-sdk';
import { scheduleTask, unscheduleTask } from '../runtime';
import type { TenantJobData, TenantTask } from './types';
import { TENANT_MESSAGE_FETCH_INTERVAL_MS } from '../../../../../config';
import { createTenantAgent } from '../..';
import { MultiTenantPluto } from '../../database';
import { PRISM_DID_RESOLVERS } from '../../../../../config/resolvers';
import { processTenantMessages } from '../../inbox';

export const processMessagesTask: TenantTask<TenantJobData> = {
  queueName: 'tenant-process-messages',
  jobName: 'process-messages',
  everyMs: TENANT_MESSAGE_FETCH_INTERVAL_MS,
  buildData: (tenantId) => ({ tenantId }),
  async process(job) {
    const { tenantId } = job.data;
    const apollo = new Apollo();
    const castor = new Castor(apollo, PRISM_DID_RESOLVERS);
    await MultiTenantPluto.connect({ dbName: 'portal' });
    const pluto = new MultiTenantPluto(tenantId);
    const agent = await createTenantAgent({
      tenantId,
      castor,
      pluto,
    });
    await agent.start();
    await processTenantMessages(agent, pluto);
    console.log(
      `[process-messages] tenant=${tenantId} job=${job.id} at ${new Date().toISOString()}`,
    );
  },
};

/**
 * Ensures the given tenant has exactly one repeatable inbox-processing task.
 * Safe to call on every login/provision: the scheduler is keyed by tenant, so
 * an existing one is updated in place rather than duplicated.
 */
export function startProcessMessages(tenantId: string): Promise<void> {
  return scheduleTask(processMessagesTask, tenantId);
}

/** Stops processing inbox messages for a tenant (e.g. on offboarding). */
export function stopProcessMessages(tenantId: string): Promise<void> {
  return unscheduleTask(processMessagesTask, tenantId);
}
