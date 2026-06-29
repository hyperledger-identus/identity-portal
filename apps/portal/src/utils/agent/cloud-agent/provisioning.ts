/**
 * @module Utils
 *
 * ## Cloud Agent wallet auto-provisioning
 *
 * The Identus Cloud Agent is multi-tenant: every wallet-scoped request must
 * resolve to a *wallet* the caller is permitted to use. When authenticating
 * with Keycloak the agent looks up that permission via UMA, but it does **not**
 * create a wallet for a freshly-seen user (auto-provisioning only applies to the
 * `apikey` method). So a brand-new Keycloak user gets `403 "No wallet
 * permissions found"` until an admin onboards them.
 *
 * This helper closes that gap from the BFF: right after login we ensure the
 * logged-in user owns a wallet. The flow mirrors the manual admin onboarding:
 *
 * 1. Probe a wallet-scoped endpoint with the *user's* access token.
 *    - `200` → the user already has a wallet, nothing to do.
 *    - `403` → no wallet yet, provision one.
 * 2. Create a wallet via the admin API (`POST /wallets`).
 * 3. Grant the user's subject a UMA permission on it
 *    (`POST /wallets/{walletId}/uma-permissions`).
 *
 * The probe in step 1 is what makes this idempotent across logins. The admin
 * `/wallets` endpoints are intentionally absent from the agent's published
 * OpenAPI doc, so this uses `fetch` directly rather than the generated client.
 *
 * @category Utils
 */
import {
  CLOUD_AGENT_ADMIN_API_KEY,
  CLOUD_AGENT_BASE_URL,
  WALLET_AUTO_PROVISION_ENABLED,
} from '../../../config';

/** Wallet-scoped, side-effect-free endpoint used to detect an existing wallet. */
const WALLET_PROBE_PATH = '/did-registrar/dids?offset=0&limit=1';

function agentUrl(path: string): string {
  return `${CLOUD_AGENT_BASE_URL.replace(/\/$/, '')}${path}`;
}

function adminHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-admin-api-key': CLOUD_AGENT_ADMIN_API_KEY,
  };
}

async function describeFailure(res: Response): Promise<string> {
  const body = await res.text().catch(() => '');
  return `HTTP ${res.status}${body ? ` - ${body}` : ''}`;
}

/**
 * Returns `true` when the user already has access to a wallet, `false` when the
 * agent reports no wallet permission. Throws on any other (unexpected) status so
 * the caller can log it without silently masking a misconfiguration.
 */
async function userHasWallet(accessToken: string): Promise<boolean> {
  const res = await fetch(agentUrl(WALLET_PROBE_PATH), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (res.status === 200) return true;
  if (res.status === 403) return false;

  throw new Error(
    `Unexpected response probing wallet access: ${await describeFailure(res)}`,
  );
}

/** Creates a new wallet via the admin API and returns its id. */
async function createWallet(label: string): Promise<string> {
  const res = await fetch(agentUrl('/wallets'), {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify({ name: label }),
  });

  if (!res.ok) {
    throw new Error(`Failed to create wallet: ${await describeFailure(res)}`);
  }

  const wallet = (await res.json()) as { id?: string };
  if (!wallet.id) {
    throw new Error('Wallet created but no id was returned by the agent.');
  }
  return wallet.id;
}

/** Grants a Keycloak subject a UMA permission on the given wallet (admin API). */
async function grantWalletPermission(
  walletId: string,
  subject: string,
): Promise<void> {
  const res = await fetch(agentUrl(`/wallets/${walletId}/uma-permissions`), {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify({ subject }),
  });

  if (!res.ok) {
    throw new Error(
      `Failed to grant wallet permission: ${await describeFailure(res)}`,
    );
  }
}

export type EnsureWalletOptions = {
  /** Keycloak subject (`sub` claim) the wallet permission is granted to. */
  subject: string;
  /** A valid user access token, used to detect an already-provisioned wallet. */
  accessToken: string;
  /** Human-friendly wallet name (e.g. the username); falls back to the subject. */
  label?: string;
};

/**
 * Ensures the given Keycloak user owns a wallet in the Cloud Agent, creating one
 * (and granting the UMA permission) on first login. A no-op when auto-provisioning
 * is disabled or the user already has a wallet.
 *
 * Note: this is intentionally not concurrency-locked. The probe makes repeated
 * logins idempotent; two truly simultaneous *first* logins for the same user
 * could create two wallets, which is acceptable for the portal's usage.
 */
export async function provisionTenant(
  options: EnsureWalletOptions,
): Promise<void> {
  if (!WALLET_AUTO_PROVISION_ENABLED) return;

  if (await userHasWallet(options.accessToken)) return;

  const label = options.label ?? `wallet-${options.subject}`;
  const walletId = await createWallet(label);
  await grantWalletPermission(walletId, options.subject);

  console.log(
    `Provisioned wallet ${walletId} for user ${options.subject} (${label}).`,
  );
}
