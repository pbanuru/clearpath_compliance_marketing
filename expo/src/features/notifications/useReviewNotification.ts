import { useEffect, useRef } from 'react';
import { useLocalSearchParams } from 'expo-router';
import type { Id } from '@clearpath/backend/convex/_generated/dataModel';
import type { ReviewDetail } from '@/features/review/model';

export function useReviewNotification(
  data: ReviewDetail | undefined,
  setNumber: (value: number) => void,
  setSelected: (value: Id<'findings'>) => void,
  setAsset: (value: Id<'assets'>) => void,
  setMobilePanel: (value: string) => void,
) {
  const { findingId } = useLocalSearchParams<{ findingId?: string }>();
  const revealed = useRef('');
  useEffect(() => {
    const finding = data?.findings.find((item) => item._id === findingId);
    if (!finding || revealed.current === findingId) return;
    revealed.current = findingId ?? '';
    setNumber(finding.version);
    setSelected(finding._id);
    if (finding.location) setAsset(finding.location.assetId);
    setMobilePanel('findings');
    const frame = requestAnimationFrame(() => {
      const target = document.getElementById(`finding-${finding._id}`);
      target?.scrollIntoView({ block: 'center' });
      target
        ?.querySelector<HTMLButtonElement>('.cp-finding-select')
        ?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [data, findingId, setNumber, setSelected, setAsset, setMobilePanel]);
}
