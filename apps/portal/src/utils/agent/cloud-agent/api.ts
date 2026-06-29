import type { components } from './spec';

/** A single managed DID entry as returned by the agent's DID registrar. */
export type ManagedDID = components['schemas']['ManagedDID'];

/** A page of managed DIDs (`kind: "ManagedDIDPage"`). */
export type ManagedDIDPage = components['schemas']['ManagedDIDPage'];

export function toDetail(error: unknown, status: number): string {
  if (typeof error === 'object' && error && 'detail' in error) {
    return String((error as { detail?: unknown }).detail);
  }
  return `Cloud Agent request failed (HTTP ${status})`;
}