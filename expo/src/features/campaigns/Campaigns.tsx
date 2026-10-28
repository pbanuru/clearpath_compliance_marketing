import { RouterAnchor } from '@/components/RouterAnchor';
import { Link, router, useLocalSearchParams } from 'expo-router';
import { usePaginatedQuery } from 'convex/react';
import { FiFolder, FiPlus } from 'react-icons/fi';
import { api } from '@clearpath/backend/convex/_generated/api';
import { products } from '../review/model';
import { CampaignForm } from './CampaignForm';
import { CampaignSummary } from './CampaignSummary';

export function Campaigns() {
  const { new: creating } = useLocalSearchParams<{ new?: string }>();
  const { results, status, loadMore } = usePaginatedQuery(
    api.campaigns.list,
    {},
    { initialNumItems: 25 },
  );
  return (
    <main className="cp-page">
      <div className="cp-page-heading">
        <div>
          <span className="cp-eyebrow">YOUR WORKSPACE</span>
          <h1 style={{ marginTop: 8 }}>Campaigns</h1>
          <p>Keep a launch and its submissions together.</p>
        </div>
        <Link href="/campaigns?new=1" asChild>
          <RouterAnchor className="cp-button">
            <FiPlus />
            New campaign
          </RouterAnchor>
        </Link>
      </div>
      {creating === '1' && <CampaignForm onClose={() => router.replace('/campaigns')} />}
      {status === 'LoadingFirstPage' ? (
        <p role="status">Loading campaigns…</p>
      ) : !results.length ? (
        <section className="cp-empty">
          <FiFolder size={32} />
          <h2>No campaigns yet</h2>
          <p>Group related submissions and enter their shared context once.</p>
          {creating !== '1' && (
            <Link href="/campaigns?new=1" asChild>
              <RouterAnchor className="cp-button primary">New campaign</RouterAnchor>
            </Link>
          )}
        </section>
      ) : (
        <div className="cp-campaign-list">
          {results.map((campaign) => (
            <Link key={campaign._id} href={`/campaigns/${campaign._id}`} asChild>
              <RouterAnchor className="cp-campaign-card">
                <div className="cp-campaign-card-title">
                  <FiFolder size={20} />
                  <div>
                    <h2>{campaign.name}</h2>
                    <p className="cp-small">
                      {campaign.product ? products[campaign.product] : 'No product selected'}
                      {campaign.goLiveDate && ` · Go-live ${campaign.goLiveDate}`}
                    </p>
                  </div>
                </div>
                <CampaignSummary counts={campaign.counts} compact />
              </RouterAnchor>
            </Link>
          ))}
        </div>
      )}
      {(status === 'CanLoadMore' || status === 'LoadingMore') && (
        <button
          className="cp-button"
          disabled={status === 'LoadingMore'}
          onClick={() => loadMore(25)}
        >
          Load more
        </button>
      )}
    </main>
  );
}
