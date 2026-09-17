import { AcceptInvitation } from './AcceptInvitation';

/**
 * Landing-page (and future route) bundle for holder OOB invitations.
 * Preview state lives in AcceptInvitation; onAccepted is passed through so
 * ticket 009 can refresh the credential list after approve.
 */
export function InvitationsSection({
  onAccepted,
  onRejected,
}: {
  onAccepted?: () => void;
  onRejected?: () => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <AcceptInvitation onAccepted={onAccepted} onRejected={onRejected} />
    </div>
  );
}
