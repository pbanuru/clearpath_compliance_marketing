import { useLocalSearchParams } from 'expo-router';
import type { Id } from '@clearpath/backend/convex/_generated/dataModel';
import { Campaign } from '@/features/campaigns/Campaign';
import { SignedIn } from '@/features/review/Workspace';

export default function CampaignPage() {
  const { id } = useLocalSearchParams<{ id: Id<'campaigns'> }>();
  return (
    <SignedIn>
      <Campaign key={id} id={id} />
    </SignedIn>
  );
}
