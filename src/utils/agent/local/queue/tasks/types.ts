import type { Job } from "bullmq";

/** Every tenant job carries at least the tenant it belongs to. */
export type TenantJobData = {
  tenantId: string;
};

/**
 * Declarative definition of a per-tenant, repeatable task. The queue runtime
 * turns each definition into exactly one BullMQ queue + worker and uses it to
 * upsert/remove one repeatable job per tenant — so a task file only describes
 * its identity, cadence, payload and processing logic.
 */
export interface TenantTask<TData extends TenantJobData = TenantJobData> {
  /** Name of the queue (and worker) backing this task. Must be unique. */
  readonly queueName: string;
  /** Job name produced by every tenant scheduler for this task. */
  readonly jobName: string;
  /** How often the task runs per tenant, in milliseconds. */
  readonly everyMs: number;
  /** Builds the job payload for a given tenant. */
  buildData(tenantId: string): TData;
  /** Processes a single fired job. */
  process(job: Job<TData>): Promise<void>;
}
