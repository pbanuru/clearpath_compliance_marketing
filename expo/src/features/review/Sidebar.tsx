import { Link, useLocalSearchParams, usePathname } from 'expo-router';
import { useConvexAuth, useQuery } from 'convex/react';
import { FiPlus, FiInbox, FiEdit3, FiCheckCircle, FiLayers, FiBookOpen } from 'react-icons/fi';
import { api } from '@clearpath/backend/convex/_generated/api';
import { filterLabels, reviewFilter } from './model';

const items = [
  { key: 'needs_review', icon: FiInbox },
  { key: 'changes_requested', icon: FiEdit3 },
  { key: 'approved', icon: FiCheckCircle },
  { key: 'all', icon: FiLayers },
] as const;
export function Sidebar({ close }: { close: () => void }) {
  const { isAuthenticated } = useConvexAuth();
  const counts = useQuery(api.reviews.counts, isAuthenticated ? {} : 'skip');
  const { filter } = useLocalSearchParams<{ filter?: string }>();
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
      <span className="cp-nav-caption nav-label">WORKSPACE</span>
      {items.map(({ key, icon: Icon }) => (
        <Link key={key} href={`/?filter=${key}`} asChild>
          <a
            className="cp-nav-item"
            title={filterLabels[key]}
            aria-label={`${filterLabels[key]}${counts ? `, ${counts[key]}` : ''}`}
            aria-current={path === '/' && reviewFilter(filter) === key ? 'page' : undefined}
            onClick={close}
          >
            <Icon />
            <span className="nav-label">{filterLabels[key]}</span>
            {key !== 'all' && counts && (
              <span className="cp-nav-count nav-label">{counts[key]}</span>
            )}
          </a>
        </Link>
      ))}
      <div className="cp-nav-divider" />
      <Link href="/policies" asChild>
        <a
          className="cp-nav-item"
          title="Policies"
          aria-label="Policies"
          aria-current={path === '/policies' ? 'page' : undefined}
          onClick={close}
        >
          <FiBookOpen />
          <span className="nav-label">Policies</span>
        </a>
      </Link>
      <p className="cp-nav-foot nav-label">
        AI checks the material.
        <br />
        You make the decision.
      </p>
    </nav>
  );
}
