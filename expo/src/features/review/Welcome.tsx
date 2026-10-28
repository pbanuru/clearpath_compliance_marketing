import { useAccount } from '@/features/auth/useAccount';
import { FiShield } from 'react-icons/fi';
import './landing.css';

export function Welcome() {
  const account = useAccount();
  const alt =
    'ClearPath review of a personal loan social ad, with an approval claim highlighted in the image and Required findings beside it.';
  return (
    <main className="cp-landing">
      <section className="cp-landing-intro">
        <h1>Get marketing approved faster</h1>
        <p>
          Submit an ad, email, landing page, or video. ClearPath checks it against lending
          advertising rules, shows each issue where it appears, and your compliance reviewer
          approves or requests changes in one place.
        </p>
        <div className="cp-actions">
          <button className="cp-button primary" onClick={() => void account.signIn()}>
            Sign in
          </button>
          <button
            className="cp-button"
            onClick={() => void account.signIn({ screenHint: 'sign-up' })}
          >
            Create account
          </button>
        </div>
        <p className="cp-sso-line">
          <FiShield aria-hidden="true" />
          <span>
            Single sign-on with your company identity provider (Okta, Microsoft Entra ID, Google
            Workspace) through WorkOS.
          </span>
        </p>
      </section>
      <figure className="cp-product-shot">
        <img
          className="cp-product-light"
          src="/brand/review-preview-light.webp"
          alt={alt}
          width="1440"
          height="900"
          fetchPriority="high"
        />
        <img
          className="cp-product-dark"
          src="/brand/review-preview-dark.webp"
          alt={alt}
          width="1440"
          height="900"
          fetchPriority="high"
        />
        <figcaption>A personal loan social ad, with findings pinned to the material.</figcaption>
      </figure>
    </main>
  );
}
export function SidebarSkeleton() {
  return (
    <div
      className="cp-sidebar-skeleton"
      role="status"
      aria-label="Loading workspace navigation"
      aria-busy="true"
    >
      <span aria-hidden="true" />
      {[1, 2, 3, 4].map((n) => (
        <i key={n} aria-hidden="true" />
      ))}
    </div>
  );
}
