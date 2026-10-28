import { Link, useGlobalSearchParams, usePathname } from 'expo-router';
import { useConvexAuth, useQuery } from 'convex/react';
import {
  FiPlus,
  FiRefreshCw,
  FiInbox,
  FiEdit3,
  FiCheckCircle,
  FiLayers,
  FiBookOpen,
} from 'react-icons/fi';
import { api } from '@clearpath/backend/convex/_generated/api';
import { ShortcutsButton } from './Shortcuts';
import { filterLabels, reviewFilter } from './model';
import { SidebarCampaigns } from '../campaigns/SidebarCampaigns';

const items = [
  { key: 'needs_review', icon: FiInbox },
  { key: 'rechecks', icon: FiRefreshCw },
  { key: 'changes_requested', icon: FiEdit3 },
  { key: 'approved', icon: FiCheckCircle },
  { key: 'all', icon: FiLayers },
] as const;
export function Sidebar({ close }: { close: () => void }) {
  const { isAuthenticated } = useConvexAuth();
  const counts = useQuery(api.reviews.counts, isAuthenticated ? {} : 'skip');
  const rechecks = useQuery(api.policy.rechecks.count, isAuthenticated ? {} : 'skip');
  const policyBadges = useQuery(api.policy.monitorState.badges, isAuthenticated ? {} : 'skip');
  const { filter } = useGlobalSearchParams<{ filter?: string }>();
  const path = usePathname();
  return (
    <nav className="cp-nav" aria-label="Main navigation">
      <Link href="/submit" asChild>
        <a
          className="cp-nav-new"
          title="New submission"
          aria-label="New submission"
          onClick={close}
        >
          <FiPlus />
          <span className="nav-label">New submission</span>
        </a>
      </Link>
      {items.map(({ key, icon: Icon }) => (
        <Link key={key} href={`/?filter=${key}`} asChild>
          <a
            className="cp-nav-item"
            title={filterLabels[key]}
            aria-label={`${filterLabels[key]}${counts ? `, ${key === 'rechecks' ? (rechecks ?? 0) : counts[key]}` : ''}`}
            aria-current={path === '/' && reviewFilter(filter) === key ? 'page' : undefined}
            onClick={close}
          >
            <Icon />
            <span className="nav-label">{filterLabels[key]}</span>
            {key !== 'all' && counts && (
              <span className="cp-nav-count nav-label">
                {key === 'rechecks' ? (rechecks ?? 0) : counts[key]}
              </span>
            )}
          </a>
        </Link>
      ))}
      <div className="cp-nav-divider" />
      <SidebarCampaigns close={close} />
      <div className="cp-nav-divider" />
      <Link href="/policies" asChild>
        <a
          className="cp-nav-item"
          title="Policies"
          aria-label={`Policies${policyBadges ? `, ${policyBadges.open} updates, ${policyBadges.failing} failing sources` : ''}`}
          aria-current={path === '/policies' ? 'page' : undefined}
          onClick={close}
        >
          <FiBookOpen />
          <span className="nav-label">Policies</span>
          {!!policyBadges && policyBadges.open + policyBadges.failing > 0 && (
            <span
              className="cp-nav-count nav-label"
              title={`${policyBadges.open} updates · ${policyBadges.failing} failing sources`}
            >
              {policyBadges.open + policyBadges.failing}
            </span>
          )}
        </a>
      </Link>
      <ShortcutsButton nav />
    </nav>
  );
}
