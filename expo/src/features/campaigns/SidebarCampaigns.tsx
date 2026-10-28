import { RouterAnchor } from '@/components/RouterAnchor';
import { Link, usePathname } from 'expo-router';
import { useConvexAuth, useQuery } from 'convex/react';
import { FiFolder, FiPlus } from 'react-icons/fi';
import { api } from '@clearpath/backend/convex/_generated/api';

export function SidebarCampaigns({ close }: { close: () => void }) {
  const { isAuthenticated } = useConvexAuth();
  const data = useQuery(
    api.campaigns.list,
    isAuthenticated ? { paginationOpts: { numItems: 5, cursor: null } } : 'skip',
  );
  const path = usePathname();
  return (
    <section className="cp-nav-campaigns" aria-label="Campaigns">
      <div className="cp-nav-campaign-heading">
        <span className="cp-nav-caption nav-label">CAMPAIGNS</span>
        <Link href="/campaigns?new=1" asChild>
          <RouterAnchor
            className="cp-nav-add"
            title="New campaign"
            aria-label="New campaign"
            onClick={close}
          >
            <FiPlus />
          </RouterAnchor>
        </Link>
      </div>
      {data?.page.map((campaign) => (
        <Link key={campaign._id} href={`/campaigns/${campaign._id}`} asChild>
          <RouterAnchor
            className="cp-nav-item"
            title={campaign.name}
            aria-label={`${campaign.name}, ${campaign.counts.approved} of ${campaign.counts.total} approved`}
            aria-current={path === `/campaigns/${campaign._id}` ? 'page' : undefined}
            onClick={close}
          >
            <FiFolder />
            <span className="nav-label cp-nav-campaign-name">{campaign.name}</span>
            <span className="cp-nav-count nav-label">
              {campaign.counts.approved}/{campaign.counts.total}
            </span>
          </RouterAnchor>
        </Link>
      ))}
      <Link href="/campaigns" asChild>
        <RouterAnchor
          className="cp-nav-item"
          title="All campaigns"
          aria-label="All campaigns"
          aria-current={path === '/campaigns' ? 'page' : undefined}
          onClick={close}
        >
          <FiFolder />
          <span className="nav-label">All campaigns</span>
        </RouterAnchor>
      </Link>
    </section>
  );
}
