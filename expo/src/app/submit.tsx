import { Submit } from '@/features/review/Submit';
import { SignedIn } from '@/features/review/Workspace';
export default function SubmissionPage() {
  return (
    <SignedIn>
      <Submit />
    </SignedIn>
  );
}
