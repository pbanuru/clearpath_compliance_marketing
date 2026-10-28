import { useLocalSearchParams } from 'expo-router';
import type { Id } from '@clearpath/backend/convex/_generated/dataModel';
import { Review } from '@/features/review/Review';
import { SignedIn } from '@/features/review/Workspace';
export default function ReviewPage() {
  const { id } = useLocalSearchParams<{ id: Id<'reviews'> }>();
  return (
    <SignedIn>
      <Review key={id} id={id} />
    </SignedIn>
  );
}
