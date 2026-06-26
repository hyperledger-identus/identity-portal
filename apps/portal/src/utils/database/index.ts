import { RIDB, WasmInternal } from "@trust0/ridb";
import { TableName, type Pluto } from "@hyperledger/identus-sdk";
import { AppRIDB, ExtendedStartOptions, RIDBCollection } from "./types";
import { schemas } from "./schemas";
import { migrations } from "./migrations";

export async function createExtendedStore(
  dbName: string,
  startOptions: ExtendedStartOptions = {},
): Promise<{ store: Pluto.Store; ridb: AppRIDB }> {
  await WasmInternal();

  const ridb = new RIDB({ dbName, schemas, migrations });

  const getCollection = (table: TableName) => ridb.collections[table] as unknown as RIDBCollection;
  const getModel = <T>(docs: unknown): T[] => docs as T[];

  const store: Pluto.Store = {
    async start() {
      console.log("Starting RIDB...", startOptions);
      if (!ridb.started) {
        await ridb.start(startOptions);
      }
    },
    async stop() {
      return ridb.close();
    },
    async query(table, query) {
      const collection = getCollection(table);
      const results = await collection.find(query?.selector ?? {});
      return getModel(results)
    },
    async insert(table, model) {
      const collection = getCollection(table);
      await collection.create(model);
    },
    async update(table, model) {
      const collection = getCollection(table);
      await collection.update(model);
    },
    async delete(table, uuid) {
      const collection = getCollection(table);
      await collection.delete(uuid);
    },
  };

  return { store, ridb };
}

