const DEFAULT_MONGODB_URL =
  "mongodb://root:default12345@localhost:27018/portal?authSource=admin";

export const config = {
  PORT: process.env.PORT ?? "3000",
  MONGODB_URL: process.env.MONGODB_URL ?? DEFAULT_MONGODB_URL,
};
