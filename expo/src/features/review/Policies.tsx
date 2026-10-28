import { useQuery } from 'convex/react';
import { FiExternalLink } from 'react-icons/fi';
import { api } from '@clearpath/backend/convex/_generated/api';
import { products, channels } from './model';

const kinds = {
  law: 'Laws',
  regulation: 'Regulations',
  guidance: 'Guidance',
  clearpath_standard: 'ClearPath standards',
};
export function Policies() {
  const policies = useQuery(api.policies.list, {});
  return (
    <main className="cp-page">
      <div className="cp-page-heading">
        <div>
          <h1 style={{ marginTop: 8 }}>Policies</h1>
          <p>What the AI check looks for. A reviewer makes every decision.</p>
        </div>
      </div>
      {!policies ? (
        <p role="status">Loading policies…</p>
      ) : (
        (['law', 'regulation', 'guidance', 'clearpath_standard'] as const).map((kind) => (
          <section key={kind} className="cp-policy-group">
            <h2>{kinds[kind]}</h2>
            <div className="cp-policy-grid">
              {policies
                .filter((p) => p.kind === kind)
                .map((policy) => (
                  <article key={policy.id} className="cp-policy">
                    <h3>{policy.title}</h3>
                    <p>
                      {policy.check[0]?.toUpperCase()}
                      {policy.check.slice(1)}
                    </p>
                    <p className="cp-small">
                      Applies to:{' '}
                      {policy.appliesTo.products
                        ?.map((p) => Object.entries(products).find(([key]) => key === p)?.[1] ?? p)
                        .join(', ') ?? 'All products'}{' '}
                      ·{' '}
                      {policy.appliesTo.channels
                        ?.map((c) => Object.entries(channels).find(([key]) => key === c)?.[1] ?? c)
                        .join(', ') ?? 'All channels'}
                    </p>
                    {policy.source.url ? (
                      <a
                        className="cp-small"
                        href={policy.source.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {policy.source.label} <FiExternalLink />
                      </a>
                    ) : (
                      <span className="cp-small">{policy.source.label}</span>
                    )}
                  </article>
                ))}
            </div>
          </section>
        ))
      )}
    </main>
  );
}
