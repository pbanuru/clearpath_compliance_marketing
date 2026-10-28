import { useEffect, useRef, useState } from 'react';
import { useAction, useQuery } from 'convex/react';
import type { FunctionArgs } from 'convex/server';
import type { Id } from '@clearpath/backend/convex/_generated/dataModel';
import { api } from '@clearpath/backend/convex/_generated/api';
import { errorMessage } from '@/features/assets/media';
import { QuickCheckSummary } from './QuickCheckSummary';

export function SubmitQuickCheck({
  assetIds,
  context,
  uploading,
  hasAssessableAssets,
}: {
  assetIds: Id<'assets'>[];
  context: {
    product?: FunctionArgs<typeof api.quickCheck.forAssets>['product'];
    channel?: FunctionArgs<typeof api.quickCheck.forAssets>['channel'];
    jurisdictions: string[];
    offerTerms?: string;
    notes?: string;
  };
  uploading: boolean;
  hasAssessableAssets: boolean;
}) {
  const run = useAction(api.quickCheck.forAssets);
  const [state, setState] = useState<{ key: string; id?: Id<'quickChecks'>; error?: string }>();
  const eligible =
    !uploading &&
    assetIds.length > 0 &&
    !!context.product &&
    !!context.channel &&
    context.jurisdictions.length > 0;
  const key = JSON.stringify({
    assetIds,
    product: context.product,
    channel: context.channel,
    jurisdictions: context.jurisdictions,
    offerTerms: context.offerTerms,
    notes: context.notes,
  });
  const parameters = useRef({ assetIds, ...context });
  useEffect(() => {
    parameters.current = { assetIds, ...context };
  }, [assetIds, context]);
  useEffect(() => {
    if (!eligible) return;
    let current = true;
    const timer = setTimeout(() => {
      const args = parameters.current;
      if (!args.product || !args.channel) return;
      run({
        assetIds: args.assetIds,
        product: args.product,
        channel: args.channel,
        jurisdictions: args.jurisdictions,
        offerTerms: args.offerTerms,
        notes: args.notes,
      })
        .then((result) => {
          if (current) setState({ key, id: result._id });
        })
        .catch((cause: unknown) => {
          if (current) setState({ key, error: errorMessage(cause, 'Quick check unavailable') });
        });
    }, 650);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [eligible, key, run]);
  const check = useQuery(
    api.quickCheck.get,
    state?.key === key && state.id ? { id: state.id } : 'skip',
  );
  if (!eligible || !hasAssessableAssets) return null;
  return (
    <QuickCheckSummary
      check={check}
      loading={state?.key !== key || (check === undefined && !state.error)}
      failed={Boolean(state?.key === key && state.error) || check === null}
    />
  );
}
