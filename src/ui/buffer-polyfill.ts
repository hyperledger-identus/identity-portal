import { Buffer } from "buffer";

const scope = globalThis as typeof globalThis & { Buffer?: typeof Buffer };

if (typeof scope.Buffer === "undefined") {
  scope.Buffer = Buffer;
}
