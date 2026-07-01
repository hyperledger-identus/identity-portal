/**
 * @module Utils
 *
 * ## Queue runtime (BullMQ + Redis)
 *
 * The task-agnostic plumbing shared by every task in `./tasks`. It owns the
 * Redis connection options and lazily-created per-task {@link Queue} and
 * {@link Worker} instances, and exposes small helpers so each task only has to
 * describe *what* it does (see {@link TenantTask}) rather than re-implement the
 * BullMQ wiring.
 *
 * @category Utils
 */
import { Queue, Worker, type ConnectionOptions } from "bullmq";
import { REDIS_URL } from "../../../../config";
import type { TenantTask } from "./tasks/types";

/**
 * BullMQ requires `maxRetriesPerRequest: null` on the underlying ioredis
 * connection (blocking commands must never give up). Passing connection options
 * (rather than a shared client) lets each Queue and Worker own the right kind of
 * connection.
 */
const connection: ConnectionOptions = {
  url: REDIS_URL,
  maxRetriesPerRequest: null,
};

/** One producer-side queue per task, keyed by queue name. */
const queues = new Map<string, Queue>();

/** One worker per task, keyed by queue name. */
const workers = new Map<string, Worker>();

/** Lazily creates (and caches) the producer-side queue backing a task. */
function getQueue(queueName: string): Queue {
  let queue = queues.get(queueName);
  if (!queue) {
    queue = new Queue(queueName, { connection });
    queues.set(queueName, queue);
  }
  return queue;
}

/** Deterministic, tenant-scoped scheduler id so upserts stay idempotent. */
function schedulerId(task: TenantTask, tenantId: string): string {
  return `${task.jobName}:${tenantId}`;
}

/**
 * Ensures the given tenant has exactly one repeatable job for `task`. Safe to
 * call repeatedly: the scheduler id is derived from the tenant, so an existing
 * scheduler is updated in place rather than duplicated.
 */
export async function scheduleTask(task: TenantTask, tenantId: string): Promise<void> {
  if (!tenantId) return;

  await getQueue(task.queueName).upsertJobScheduler(
    schedulerId(task, tenantId),
    { every: task.everyMs },
    {
      name: task.jobName,
      data: task.buildData(tenantId),
      opts: {
        // Keep the queue tidy — we don't need a history of fired jobs.
        removeOnComplete: true,
        removeOnFail: 100,
      },
    },
  );
}

/** Removes a tenant's repeatable job for `task` (e.g. on offboarding). */
export async function unscheduleTask(task: TenantTask, tenantId: string): Promise<void> {
  if (!tenantId) return;
  await getQueue(task.queueName).removeJobScheduler(schedulerId(task, tenantId));
}

/**
 * Boots a worker for `task` if one isn't already running. Exactly one worker per
 * task per process is enough; BullMQ pulls jobs from Redis as schedulers fire.
 */
export function registerWorker(task: TenantTask): void {
  if (workers.has(task.queueName)) return;

  const worker = new Worker(task.queueName, (job) => task.process(job), { connection });
  worker.on("failed", (job, err) => {
    console.error(`[${task.jobName}] job ${job?.id} failed:`, err);
  });
  workers.set(task.queueName, worker);
}

/** Gracefully closes every queue and worker created by the runtime. */
export async function closeAll(): Promise<void> {
  await Promise.all([...workers.values()].map((worker) => worker.close()));
  await Promise.all([...queues.values()].map((queue) => queue.close()));
  workers.clear();
  queues.clear();
}
