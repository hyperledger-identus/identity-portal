/**
 * @module Utils
 *
 * ## Tenant task registry
 *
 * Central list of every per-tenant {@link TenantTask}. The queue runtime boots a
 * worker for each entry, and the per-task `start*`/`stop*` helpers schedule them
 * for an individual tenant.
 *
 * @category Utils
 */
import { fetchMessagesTask } from "./fetch-messages";
import type { TenantTask } from "./types";

/** All per-tenant tasks the queue runtime should run workers for. */
export const tenantTasks: TenantTask[] = [fetchMessagesTask];

export { fetchMessagesTask, startFetchingMessages, stopFetchingMessages } from "./fetch-messages";
export type { TenantTask, TenantJobData } from "./types";
