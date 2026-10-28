import { RouterAnchor } from '@/components/RouterAnchor';
import { useState } from 'react';
import { Link } from 'expo-router';
import { useQuery } from 'convex/react';
import { FiArrowLeft, FiEdit3, FiPlus, FiInbox } from 'react-icons/fi';
import { api } from '@clearpath/backend/convex/_generated/api';
import type { Id } from '@clearpath/backend/convex/_generated/dataModel';
import { products } from '../review/model';
import { QueueRows } from '../review/QueueRows';
import { CampaignForm } from './CampaignForm';
import { CampaignSummary } from './CampaignSummary';

export function Campaign({ id }: { id: Id<'campaigns'> }) {
  const [editing, setEditing] = useState(false);
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const data = useQuery(api.campaigns.get, {
    campaignId: id,
    paginationOpts: { numItems: 25, cursor: cursors.at(-1) ?? null },
  });
  if (!data)
    return (
      <main className="cp-page">
        <p role="status">Loading campaign…</p>
      </main>
    );
  const { campaign, submissions, counts } = data;
  return (
    <main className="cp-page cp-campaign-page">
      <Link href="/campaigns" asChild>
        <RouterAnchor className="cp-back">
          <FiArrowLeft />
          Campaigns
        </RouterAnchor>
      </Link>
      <div className="cp-page-heading">
        <div>
          <span className="cp-eyebrow">CAMPAIGN</span>
          <h1 style={{ marginTop: 8 }}>{campaign.name}</h1>
          <p>
            {campaign.product ? products[campaign.product] : 'No product selected'}
            {campaign.goLiveDate && ` · Go-live ${campaign.goLiveDate}`}
          </p>
        </div>
        <Link href={`/submit?campaign=${id}`} asChild>
          <RouterAnchor className="cp-button primary">
            <FiPlus />
            Add submission
          </RouterAnchor>
        </Link>
      </div>
      <CampaignSummary counts={counts} />
      {editing ? (
        <CampaignForm campaign={campaign} onClose={() => setEditing(false)} />
      ) : (
        <section className="cp-campaign-context" aria-label="Campaign context">
          <div className="cp-campaign-context-heading">
            <h2>Shared context</h2>
            <button className="cp-button quiet" onClick={() => setEditing(true)}>
              <FiEdit3 />
              Edit context
            </button>
          </div>
          {campaign.offerTerms && (
            <p>
              <strong>Offer terms</strong>
              {campaign.offerTerms}
            </p>
          )}
          {campaign.notes && (
            <p>
              <strong>Notes</strong>
              {campaign.notes}
            </p>
          )}
          {!campaign.offerTerms && !campaign.notes && (
            <p className="cp-small">Add offer terms and notes to help review this launch.</p>
          )}
        </section>
      )}
      <div className="cp-campaign-submissions-heading">
        <h2>
          Submissions <span className="cp-small">{counts.total}</span>
        </h2>
      </div>
      {counts.total === 0 ? (
        <section className="cp-empty">
          <FiInbox size={32} />
          <h2>No submissions yet</h2>
          <p>Add the first piece of this campaign.</p>
          <Link href={`/submit?campaign=${id}`} asChild>
            <RouterAnchor className="cp-button primary">Add submission</RouterAnchor>
          </Link>
        </section>
      ) : (
        <QueueRows rows={submissions.page} />
      )}
      <div className="cp-actions cp-campaign-pagination">
        {cursors.length > 1 && (
          <button className="cp-button" onClick={() => setCursors((c) => c.slice(0, -1))}>
            Previous
          </button>
        )}
        {!submissions.isDone && (
          <button
            className="cp-button"
            onClick={() => setCursors((c) => [...c, submissions.continueCursor])}
          >
            Next submissions
          </button>
        )}
      </div>
    </main>
  );
}
