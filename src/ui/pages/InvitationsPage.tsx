import { InvitationsSection } from '../InvitationsSection';

/**
 * The holder's side: paste and accept an out-of-band invitation. The
 * credentials page reloads on every visit, so no cross-page refresh wiring is
 * needed after an accept.
 */
export function InvitationsPage() {
  return <InvitationsSection />;
}
