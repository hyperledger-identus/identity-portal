import path from "node:path";

export const PORT = process.env.PORT ?? "3000";
export const DB_ENCRYPTION_KEY = process.env.DB_ENCRYPTION_KEY ?? "CHANGEMECHANGEMECHANGEMECHANGEMECHANGEMECHANGEMECHANGEMECHANGEMECHANGEMECHANGEMECHANGEMECHANGEMECHANGEMECHANGEMECHANGEMECHANGEMECHANGEMECHANGEMECHANGEME";
export const NODE_ENV = process.env.NODE_ENV ?? "development";
export const IS_PRODUCTION = NODE_ENV === "production";
export const VITE_CONFIG = process.env.VITE_CONFIG ?? path.resolve(process.cwd(), "apps/portal/vite.config.ts");
export const UI_DIST = process.env.UI_DIST ?? path.resolve(process.cwd(), "dist/apps/portal/src/ui");
export const MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://admin:admin@localhost:27019/identus?authSource=admin';
