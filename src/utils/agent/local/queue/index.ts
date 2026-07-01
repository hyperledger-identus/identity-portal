/**
 * @module Utils
 *
 * ## Per-tenant task queue (BullMQ + Redis)
 *
 * The portal is multi-tenant (one tenant == one Keycloak subject, see
 * `api/context`), so each tenant gets its own set of recurring jobs. The
 * task-specific code lives in `./tasks` (one file per task); this module only
 * exposes the public surface:
 *
 * - per-task `start*`/`stop*` schedulers (re-exported from `./tasks`), and
 * - the process-wide worker lifecycle ({@link startQueueWorker} /
 *   {@link stopQueueWorker}).
 *
 * Duplicate prevention is structural: tasks use BullMQ **Job Schedulers** keyed
 * by a deterministic, tenant-scoped id (`<jobName>:<tenantId>`). `upsert` is
 * idempotent — scheduling again for a tenant that already has a scheduler
 * updates that one instead of creating a second, so repeated logins never spawn
 * duplicate recurring tasks. Each scheduler only ever produces one delayed job
 * at a time per tenant, so two runs of the same tenant task can't overlap.
 *
 * @category Utils
 */
import { closeAll, registerWorker } from "./runtime";
import { tenantTasks } from "./tasks";

/**
 * Boots one worker per registered task to process jobs for all tenants. Workers
 * pull jobs from Redis as the schedulers fire them. Call once at server startup.
 */
export function startQueueWorker(): void {
  for (const task of tenantTasks) {
    registerWorker(task);
  }
}

/** Gracefully tears down every queue and worker on shutdown. */
export async function stopQueueWorker(): Promise<void> {
  await closeAll();
}

export {
  startFetchingMessages,
  stopFetchingMessages,
} from "./tasks";
