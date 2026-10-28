import { Notifications } from '@/features/notifications/Notifications';
import { SignedIn } from '@/features/review/Workspace';

export default function NotificationsPage() {
  return (
    <SignedIn>
      <Notifications />
    </SignedIn>
  );
}
