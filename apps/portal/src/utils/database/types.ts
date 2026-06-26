import { RIDB } from "@trust0/ridb";
import { schemas } from "./schemas";

export type AppRIDB = RIDB<typeof schemas>;

export type ExtendedStartOptions = Pick<
    NonNullable<Parameters<AppRIDB["start"]>[0]>,
    "storageType" | "password"
>;

export type RIDBCollection = {
    find(query: unknown): Promise<unknown[]>;
    create(doc: unknown): Promise<unknown>;
    update(doc: unknown): Promise<void>;
    delete(id: string): Promise<void>;
};