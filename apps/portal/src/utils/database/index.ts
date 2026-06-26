import { RIDB, WasmInternal } from "@trust0/ridb";
import { TableName, Settings, Apollo, Pluto } from "@hyperledger/identus-sdk";
import { RIDBCollection, AppRIDB, PlutoOptions } from "./types";
import { schemas } from "./schemas";
import { migrations } from "./migrations";
import { createMongoDB } from "@trust0/ridb-mongodb";
import { randomUUID } from "node:crypto";


export class ExtendedPluto extends Pluto {

  async #findSetting(key: string): Promise<Settings | undefined> {
    const results = await this.store.query("settings", { selector: { key } });
    return (results as Settings[])[0];
  }

  #getModel<T>(docs: unknown): T[] {
    return docs as T[];
  }

  constructor({ dbName, password }: PlutoOptions) {
    let ridb: AppRIDB | undefined;

    const getCollection = (table: TableName) => {
      if (!ridb) {
        throw new Error("Store has not been started. Call start() first.");
      }
      return ridb.collections[table] as unknown as RIDBCollection;
    };

    const store: Pluto.Store = {
      start:async ()  =>{
        await WasmInternal();
        ridb ??= new RIDB({ dbName, schemas, migrations });
        if (!ridb.started) {
          const storageType = await createMongoDB();
          await ridb.start({ storageType, password });
        }
      },
      stop:async () => {
        await ridb?.close();
      },
      query: async (table, query) => {
        const collection = getCollection(table);
        const results = await collection.find(query?.selector ?? {});
        return this.#getModel(results);
      },
      insert: async (table, model) => {
        await getCollection(table).create(model);
      },
      update: async (table, model) => getCollection(table).update(model),
      delete: async (table, uuid) => getCollection(table).delete(uuid)
    };

    super(store, new Apollo());
  }

  async getSetting(key: string): Promise<string | undefined> {
    const setting = await this.#findSetting(key);
    return setting?.value;
  }

  async setSetting(key: string, value: string): Promise<void> {
    const existing = await this.#findSetting(key);
    if (existing) {
      return this.store.update("settings", { ...existing, value });
    }
    return this.store.insert("settings", {
      key,
      value,
      uuid: randomUUID(),
      id: randomUUID(),
    });
  }
}
