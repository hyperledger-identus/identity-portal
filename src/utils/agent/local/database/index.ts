import { RIDB, WasmInternal } from "@trust0/ridb";
import type { Doc } from "@trust0/ridb-core";
import { TableName, Settings, Apollo, Pluto, CollectionMap, DIDLink } from "@hyperledger/identus-sdk";
import { RIDBCollection, AppRIDB, PlutoOptions } from "./types";
import { pageOptions } from "./paging";
import { schemas } from "./schemas";
import { migrations } from "./migrations";
import { randomUUID } from "node:crypto";
import { DB_ENCRYPTION_KEY, PAGINATION_LIMIT } from "../../../../config";
import { createMongoDB } from "@trust0/ridb-mongodb";


//Module augmentation to add custom tables, with document types derived from their schema definitions
declare module "@hyperledger/identus-sdk" {
  interface CollectionMap {
    tenants: Doc<(typeof schemas)["tenants"]>;
    schemas: Doc<(typeof schemas)["schemas"]>;
    presentations: Doc<(typeof schemas)["presentations"]>;
  }
  interface DID {
    transactionId?: string;
    operationHash?: string;
    tenantId?: string;
  }
}

/**
 * Storage key for a DID row. The SDK addresses DIDs by the DID string, and
 * that string is also the collection primary key, so two tenants cannot store
 * the same mediator DID as-is. Prefixing the stored key with the tenant keeps
 * one row per tenant while lookups still use the DID string.
 */
function storageDidId(tenantId: string, uuid: string): string {
  const prefix = `${tenantId}:`;
  return uuid.startsWith(prefix) ? uuid : `${prefix}${uuid}`;
}

/** DID string stored on a row whose key was prefixed with the tenant. */
function publicDidId(tenantId: string, uuid: string): string {
  const prefix = `${tenantId}:`;
  return uuid.startsWith(prefix) ? uuid.slice(prefix.length) : uuid;
}

/** Rewrites DID-string `uuid` selectors to the tenant-scoped storage key. */
function prefixDidSelectors(value: unknown, tenantId: string): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => prefixDidSelectors(item, tenantId));
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const prefixed: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === "uuid" && typeof child === "string") {
      prefixed[key] = storageDidId(tenantId, child);
    } else if (key === "$or" || key === "$and") {
      prefixed[key] = prefixDidSelectors(child, tenantId);
    } else {
      prefixed[key] = child;
    }
  }
  return prefixed;
}

type StoredDid = {
  uuid?: string;
  tenantId?: string;
  method?: string;
  schema?: string;
  alias?: string | null;
  status?: string;
  transactionId?: string;
  operationHash?: string;
};

/** DID string for a stored key, whether or not it is tenant-prefixed. */
function publicDidOf(uuid: string | undefined): string | undefined {
  if (!uuid) {
    return undefined;
  }
  if (uuid.startsWith("did:")) {
    return uuid;
  }
  const at = uuid.indexOf(":did:");
  return at >= 0 ? uuid.slice(at + 1) : uuid;
}

function didRecord(doc: StoredDid, uuid: string, tenantId: string): Record<string, unknown> {
  const record: Record<string, unknown> = {
    uuid,
    tenantId,
    method: doc.method,
    schema: doc.schema,
  };
  for (const key of ["alias", "status", "transactionId", "operationHash"] as const) {
    if (typeof doc[key] === "string") {
      record[key] = doc[key];
    }
  }
  return record;
}

/** Stamps the tenant and, for DIDs, stores the key under that tenant. */
function tenantDidRecord(
  table: string,
  model: Record<string, unknown>,
  tenantId?: string,
): Record<string, unknown> {
  const record = { ...model };
  if (tenantId) {
    record.tenantId = tenantId;
  }
  if (table === "dids" && tenantId && typeof record.uuid === "string") {
    record.uuid = storageDidId(tenantId, record.uuid);
  }
  return record;
}

async function createDid(dids: RIDBCollection, record: Record<string, unknown>): Promise<void> {
  try {
    await dids.create(record);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("already exists")) {
      throw error;
    }
  }
}

/** Adds the current tenant to a store query. */
function scopeSelector(
  selector: Record<string, unknown>,
  tenantId?: string,
): Record<string, unknown> {
  const querySelector = { ...selector };
  if (tenantId && !querySelector.$or && !querySelector.$and) {
    querySelector.tenantId = tenantId;
  } else if (tenantId && Array.isArray(querySelector.$or)) {
    querySelector.$or = querySelector.$or.length
      ? querySelector.$or.map((item) => ({ $and: [item, { tenantId }] }))
      : [{ tenantId }];
  } else if (tenantId && Array.isArray(querySelector.$and)) {
    querySelector.$and = querySelector.$and.length
      ? querySelector.$and.map((item) => ({ $and: [item, { tenantId }] }))
      : [{ tenantId }];
  } else {
    querySelector.tenantId = tenantId;
  }
  return querySelector;
}


export class MultiTenantPluto extends Pluto {

  private static ridb: AppRIDB | undefined;
  /** Set once existing DID rows have been split onto a key per tenant. */
  private static didsPartitioned = false;

  static async connect({ dbName }: PlutoOptions) {
    await WasmInternal();
    MultiTenantPluto.ridb ??= new RIDB({ dbName, schemas, migrations });
    if (!MultiTenantPluto.ridb?.started) {
      const storageType = await createMongoDB();
      await MultiTenantPluto.ridb?.start({ storageType, password: DB_ENCRYPTION_KEY });
    }
    if (!MultiTenantPluto.didsPartitioned) {
      await MultiTenantPluto.#partitionDids();
      MultiTenantPluto.didsPartitioned = true;
    }
  }

  static #collection(table: TableName): RIDBCollection {
    if (!MultiTenantPluto.ridb) {
      throw new Error("Store has not been started. Call start() first.");
    }
    return MultiTenantPluto.ridb.collections[table] as unknown as RIDBCollection;
  }

  /**
   * Gives every tenant its own row for a DID string that was stored once.
   *
   * Rows written before the tenant prefix used the DID string as the primary
   * key. Each of those is rewritten under its owner, and mediator or routing
   * targets are copied for every other tenant that links to them.
   */
  static async #partitionDids(): Promise<void> {
    const dids = MultiTenantPluto.#collection("dids");
    const stored = await dids.find({}) as StoredDid[];
    for (const doc of stored) {
      if (!doc.tenantId || !doc.uuid?.startsWith("did:")) {
        continue;
      }
      await createDid(dids, didRecord(doc, storageDidId(doc.tenantId, doc.uuid), doc.tenantId));
      await dids.delete(doc.uuid);
    }

    const links = await MultiTenantPluto.#collection("did-link").find({
      $or: [
        { role: DIDLink.role.mediator },
        { role: DIDLink.role.routing },
      ],
    }) as Array<{ tenantId?: string; targetId?: string }>;
    const current = await dids.find({}) as StoredDid[];
    for (const link of links) {
      if (!link.tenantId || !link.targetId) {
        continue;
      }
      const key = storageDidId(link.tenantId, link.targetId);
      if (current.some((doc) => doc.uuid === key)) {
        continue;
      }
      const source = current.find((doc) => publicDidOf(doc.uuid) === link.targetId)
        ?? stored.find((doc) => publicDidOf(doc.uuid) === link.targetId);
      if (!source?.method || !source.schema) {
        continue;
      }
      await createDid(dids, {
        uuid: key,
        tenantId: link.tenantId,
        method: source.method,
        schema: source.schema,
        ...(typeof source.alias === "string" ? { alias: source.alias } : {}),
      });
      current.push({ uuid: key, tenantId: link.tenantId, method: source.method, schema: source.schema });
    }
  }

  constructor(tenantId?: string) {
    const getCollection = (table: TableName) => {
      if (!MultiTenantPluto.ridb) {
        throw new Error("Store has not been started. Call start() first.");
      }
      return MultiTenantPluto.ridb.collections[table] as unknown as RIDBCollection;
    };
    const store: Pluto.Store = {
      start: async ()  => { 
       /* empty */ 
       },
      stop: async () => { /* empty */ },
      query: async (table, query) => {
        const querySelector = { ...query?.selector } as Record<string, unknown>;
        try {
          const collection = getCollection(table);
          const prepared = table === "dids" && tenantId
            ? prefixDidSelectors(querySelector, tenantId) as Record<string, unknown>
            : querySelector;
          const scoped = scopeSelector(prepared, tenantId);
          const results = await collection.find(scoped, pageOptions(query));
          if (table === "dids" && tenantId) {
            const readable = (results as Array<Record<string, unknown>>).map((row) => (
              typeof row.uuid === "string"
                ? { ...row, uuid: publicDidId(tenantId, row.uuid) }
                : row
            ));
            return this.#getModel(readable);
          }
          return this.#getModel(results);
        } catch (error) {
          console.error("Failed to query collection:", error, querySelector);
          throw error;
        }
      },
      insert: async (table, model) => {
        const collection = getCollection(table);
        const record = tenantDidRecord(table, model as Record<string, unknown>, tenantId);
        await collection.create(record);
      },
      update: async (table, model) => {
        const collection = getCollection(table);
        const record = tenantDidRecord(table, model as Record<string, unknown>, tenantId);
        await collection.update(record);
      },
      delete: async (table, uuid) => {
        const collection = getCollection(table);
        const storedUuid = table === "dids" && tenantId ? storageDidId(tenantId, uuid) : uuid;
        const deleteQuery = { uuid: storedUuid } as Record<string, unknown>;
        if (tenantId) {
          deleteQuery.tenantId = tenantId;
        }
        const found = await collection.find(deleteQuery);
        if (!Array.isArray(found) || found.length === 0) {
          throw new Error(`Document with UUID ${uuid} not found in collection ${table}`);
        }
        await collection.delete(storedUuid);
      }
    };

    super(store, new Apollo());
  }

  async listTenants(): Promise<string[]> {
    const results = await this.store.query("tenants", { });
    return results.map((a) => a.tenantId) as string[];
  }

  async createTenant(tenantId: string): Promise<void> {
    try {
      await this.store.insert("tenants", { uuid: randomUUID(), tenantId, createdAt: Date.now(), updatedAt: Date.now() });
    } catch (error) {
      console.error("Failed to create tenant:", error);
      throw error
    }
  }

  async #findSetting(key: string): Promise<Settings | undefined> {
    const results = await this.store.query("settings", { selector: { key } });
    return (results as Settings[])[0];
  }

  #getModel<T>(docs: unknown): T[] {
    return docs as T[];
  }

  async getSetting(key: string): Promise<string | undefined> {
    const setting = await this.#findSetting(key);
    return setting?.value;
  }

  async setSetting(key: string, value: string): Promise<void> {
    const existing = await this.#findSetting(key);
    if (existing) {
      return this.store.update("settings", { ...existing, value});
    }
    return this.store.insert("settings", {
      key,
      value,
      uuid: randomUUID(),
      id: randomUUID()
    });
  }

  async getPaginatedPrismDIDs(offset: number = 0, limit: number = PAGINATION_LIMIT): Promise<CollectionMap['dids'][]> {
    const results = await this.store.query("dids", { selector: {method: 'prism'}, offset, limit });
    return results as CollectionMap['dids'][];
  }

  /** Every Prism DID of the tenant, without paging. */
  async getPrismDIDRows(): Promise<CollectionMap['dids'][]> {
    const results = await this.store.query("dids", { selector: {method: 'prism'} });
    return results as CollectionMap['dids'][];
  }

  /**
   * Reads a DID's row for this tenant. The stored key is tenant-prefixed; the
   * value returned here is the DID string.
   */
  async getDIDRecord(did: string): Promise<CollectionMap['dids'] | undefined> {
    const rows = await this.store.query("dids", { selector: { uuid: did } });
    return rows[0];
  }

  async #patchDIDRecord(did: string, changes: Partial<CollectionMap['dids']>): Promise<void> {
    const existing = await this.getDIDRecord(did);
    if (!existing) {
      throw new Error(`DID ${did} not found`);
    }
    await this.store.update("dids", { ...existing, ...changes });
  }

  /**
   * Records a DID as published: stores the publish transaction id, the hash of
   * the operation it carried and marks the status. The transaction and the hash
   * describe the same operation, so they are written together.
   */
  async setDIDPublished(did: string, transactionId: string, operationHash: string): Promise<void> {
    await this.#patchDIDRecord(did, { transactionId, operationHash, status: "published" });
  }

  /**
   * Stores the transaction id and operation hash of a DID's latest update. The
   * status stays `published`: an update changes the DID's document, not its
   * lifecycle.
   */
  async setDIDUpdated(did: string, transactionId: string, operationHash: string): Promise<void> {
    await this.#patchDIDRecord(did, { transactionId, operationHash });
  }

  /**
   * Records a DID as deactivated: stores the deactivate transaction id, the hash
   * of the operation it carried and marks the status.
   */
  async setDIDDeactivated(did: string, transactionId: string, operationHash: string): Promise<void> {
    await this.#patchDIDRecord(did, { transactionId, operationHash, status: "deactivated" });
  }

  async createSchema(schema: Omit<CollectionMap['schemas'], 'uuid'>): Promise<string> {
    const uuid = randomUUID();
    await this.store.insert("schemas", { ...schema, uuid });
    return uuid;
  }

  async getSchemas(): Promise<CollectionMap['schemas'][]> {
    const results = await this.store.query("schemas");
    return results
  }

  async getSchema(uuid: string): Promise<CollectionMap['schemas'] | undefined> {
    const schemas = await this.getSchemas();
    return schemas.find((schema) => schema.uuid === uuid);
  }

  async updateSchema(uuid: string, schema: Partial<CollectionMap['schemas']>): Promise<void> {
    const existing = await this.getSchema(uuid);
    if (!existing) {
      throw new Error(`Schema with UUID ${uuid} not found`);
    }
    return this.store.update("schemas", { ...existing, ...schema, uuid });
  }

  async deleteSchema(uuid: string): Promise<void> {
    return this.store.delete("schemas", uuid);
  }

  /**
   * Portal issuance row. SDK `IssuanceSchema` only requires id, claims,
   * credentialFormat and issuingDID; the extra fields are the protocol
   * metadata both issuer and holder flows persist.
   */
  async insertIssuance(record: CollectionMap['issuance']): Promise<void> {
    await this.store.insert("issuance", record);
  }

  async getIssuance(id: string): Promise<CollectionMap['issuance'] | undefined> {
    const rows = await this.store.query("issuance", { selector: { id } });
    return rows[0] as CollectionMap['issuance'] | undefined;
  }

  async getIssuanceByThid(
    thid: string,
    role?: 'Issuer' | 'Holder',
  ): Promise<CollectionMap['issuance'] | undefined> {
    const selector = (
      role ? { thid, role } : { thid }
    ) as Record<string, unknown>;
    const rows = await this.store.query("issuance", { selector });
    return rows[0] as CollectionMap['issuance'] | undefined;
  }

  async listIssuance(
    offset: number = 0,
    limit: number = PAGINATION_LIMIT,
    role?: 'Issuer' | 'Holder',
  ): Promise<CollectionMap['issuance'][]> {
    // `role` is a portal field on the RIDB schema, not on the SDK Issuance type.
    const selector = (role ? { role } : {}) as Record<string, unknown>;
    const results = await this.store.query("issuance", { selector, offset, limit });
    return results as CollectionMap['issuance'][];
  }

  async updateIssuance(
    id: string,
    patch: Partial<CollectionMap['issuance']>,
  ): Promise<void> {
    const existing = await this.getIssuance(id);
    if (!existing) {
      throw new Error(`Issuance record ${id} not found`);
    }
    await this.store.update("issuance", { ...existing, ...patch, id });
  }

  /** Stores a presentation record (phase 6). RIDB sets `createdAt` and `updatedAt`. */
  async insertPresentation(record: Omit<CollectionMap['presentations'], 'createdAt' | 'updatedAt'>): Promise<void> {
    await this.store.insert("presentations", record as CollectionMap['presentations']);
  }

  async getPresentation(uuid: string): Promise<CollectionMap['presentations'] | undefined> {
    const selector = { uuid } as Record<string, unknown>;
    const rows = await this.store.query("presentations", { selector });
    return rows[0] as CollectionMap['presentations'] | undefined;
  }

  async listPresentations(
    offset: number = 0,
    limit: number = PAGINATION_LIMIT,
    role?: 'Verifier' | 'Prover',
  ): Promise<CollectionMap['presentations'][]> {
    const selector = (role ? { role } : {}) as Record<string, unknown>;
    const results = await this.store.query("presentations", { selector, offset, limit });
    return results as CollectionMap['presentations'][];
  }
}


