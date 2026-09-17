import { CredentialList } from './CredentialList';

/**
 * Landing-page (and future route) bundle for holder wallet credentials.
 * Pass `refreshToken` from a parent (e.g. after invitation accept) to reload.
 */
export function CredentialsSection({
  refreshToken = 0,
}: {
  refreshToken?: number;
}) {
  return <CredentialList refreshToken={refreshToken} />;
}
