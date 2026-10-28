import { Policies } from '@/features/review/Policies';
import { SignedIn } from '@/features/review/Workspace';
import { PolicyNotificationTarget } from '@/features/notifications/PolicyNotificationTarget';
export default function PoliciesPage() {
  return (
    <SignedIn>
      <PolicyNotificationTarget />
      <Policies />
    </SignedIn>
  );
}
