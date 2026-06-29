/**
 * @module Utils
 *
 * ## Tenant message-fetch task
 *
 * A repeatable per-tenant task that polls the mediator for new DIDComm messages
 * and persists them in the tenant's store. Each tenant gets its own scheduler so
 * a slow/failing tenant never blocks the others.
 *
 * @category Utils
 */
import { Apollo, Castor} from "@hyperledger/identus-sdk";
import { scheduleTask, unscheduleTask } from "../runtime";
import type { TenantJobData, TenantTask } from "./types";
import { StartFetchingMessages } from "@hyperledger/identus-sdk/plugins/didcomm";
import { TENANT_MESSAGE_FETCH_INTERVAL_MS } from "../../../../../config";
import { createTenantAgent } from "../..";
import { MultiTenantPluto } from "../../database";

export const fetchMessagesTask: TenantTask<TenantJobData> = {
  queueName: "tenant-fetch-messages",
  jobName: "fetch-messages",
  everyMs: TENANT_MESSAGE_FETCH_INTERVAL_MS,
  buildData: (tenantId) => ({ tenantId }),
  async process(job) {
    const { tenantId } = job.data;
    const apollo = new Apollo();
    const castor = new Castor(apollo);
    await MultiTenantPluto.connect({ dbName: "portal" });
    const pluto = new MultiTenantPluto(tenantId);
    const agent = await createTenantAgent({
        tenantId,
        castor,
        pluto,
    })
    const fetchMessages = new StartFetchingMessages({})
    await agent.runTask(fetchMessages);
    console.log(
      `[fetch-messages] tenant=${tenantId} job=${job.id} at ${new Date().toISOString()}`,
    );
  },
};

/**
 * Ensures the given tenant has exactly one repeatable message-fetch task. Safe
 * to call on every login/provision: the scheduler is keyed by tenant, so an
 * existing one is updated in place rather than duplicated.
 */
export function startFetchingMessages(tenantId: string): Promise<void> {
  return scheduleTask(fetchMessagesTask, tenantId);
}

/** Stops fetching messages for a tenant (e.g. on offboarding). */
export function stopFetchingMessages(tenantId: string): Promise<void> {
  return unscheduleTask(fetchMessagesTask, tenantId);
}
