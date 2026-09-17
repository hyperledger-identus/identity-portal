import { RIDB, WasmInternal } from "@trust0/ridb";
import type { Doc } from "@trust0/ridb-core";
import { TableName, Settings, Apollo, Pluto, CollectionMap } from "@hyperledger/identus-sdk";
import { RIDBCollection, AppRIDB, PlutoOptions } from "./types";
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
  }
  interface DID {
    transactionId?: string;
    operationHash?: string;
  }
}


export class MultiTenantPluto extends Pluto {

  private static ridb: AppRIDB | undefined;

  static async connect({ dbName }: PlutoOptions) {
    await WasmInternal();
    MultiTenantPluto.ridb ??= new RIDB({ dbName, schemas, migrations });
    if (!MultiTenantPluto.ridb?.started) {
      const storageType = await createMongoDB();
      await MultiTenantPluto.ridb?.start({ storageType, password: DB_ENCRYPTION_KEY });
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

        try{
          const collection = getCollection(table);
        if (tenantId && !querySelector.$or && !querySelector.$and) {
          querySelector.tenantId = tenantId;
        } else if (tenantId && Array.isArray(querySelector.$or)) {
          if (!querySelector.$or.length) {
            querySelector.$or.push({tenantId});
          } else {
            querySelector.$or.map((item) => {
              return {
                $and: [item, {tenantId}]
              }
            })
          }
          
        } else if (tenantId && Array.isArray(querySelector.$and)) {
          if (!querySelector.$and.length) {
            querySelector.$and.push({tenantId});
          } else {
            querySelector.$and.map((item) => {
              return {
                $and: [item, {tenantId}]
              }
            })
          }
        } else {
          querySelector.tenantId = tenantId;
        }
        const results = await collection.find(querySelector);
        return this.#getModel(results);
        } catch (error) {
          console.error("Failed to query collection:", error, querySelector);
          throw error
        }
      
      },
      insert: async (table, model) => {
        const collection = getCollection(table);
        const modelWithTenantId = { ...model } as Record<string, unknown>;
        if (tenantId) {
          modelWithTenantId.tenantId = tenantId;
        }
        await collection.create(modelWithTenantId);
      },
      update: async (table, model) => {
        const collection = getCollection(table);
        const modelWithTenantId = { ...model } as Record<string, unknown>;
        if (tenantId) {
          modelWithTenantId.tenantId = tenantId;
        }
        await collection.update(modelWithTenantId);
      },
      delete: async (table, uuid) => {
        const collection = getCollection(table);
        const deleteQuery = { uuid } as Record<string, unknown>;
        if (tenantId) {
          deleteQuery.tenantId = tenantId;
        }
        const found = await collection.find(deleteQuery);
        if (!found) {
          throw new Error(`Document with UUID ${uuid} not found in collection ${table}`);
        }
        await collection.delete(uuid);
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

  /**
   * Reads a DID's row. The DID string is the collection's primary key (`uuid`),
   * so the row is looked up by it; the read stays tenant-scoped through the
   * store.
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
}


