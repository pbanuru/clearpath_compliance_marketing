import { Policies } from '@/features/review/Policies';
import { SignedIn } from '@/features/review/Workspace';
export default function PoliciesPage() {
  return (
    <SignedIn>
      <Policies />
    </SignedIn>
  );
}
