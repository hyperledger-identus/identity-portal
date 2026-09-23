import { useNavigate } from 'react-router-dom';
import { AcceptInvitation } from '../../AcceptInvitation';

/**
 * `/holder/invitations`: the holder pastes an out-of-band invitation, previews
 * the offer and approves or rejects it. It is one task with nothing to list,
 * so it stays one page. An approved invitation lands on the credentials list,
 * which names the request that was just sent.
 */
export function InvitationAcceptPage() {
  const navigate = useNavigate();

  return (
    <AcceptInvitation
      onAccepted={(record) =>
        navigate('/holder/credentials', {
          state: {
            requested: {
              recordId: record.recordId,
              protocolState: record.protocolState,
            },
          },
        })
      }
    />
  );
}
