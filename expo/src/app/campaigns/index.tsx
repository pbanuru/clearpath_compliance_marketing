import { Campaigns } from '@/features/campaigns/Campaigns';
import { SignedIn } from '@/features/review/Workspace';

export default function CampaignsPage() {
  return (
    <SignedIn>
      <Campaigns />
    </SignedIn>
  );
}
