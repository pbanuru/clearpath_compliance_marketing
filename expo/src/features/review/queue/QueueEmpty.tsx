import { Link } from 'expo-router';
import { FiInbox, FiCheck, FiPlus } from 'react-icons/fi';
export function QueueEmpty({
  search,
  clearSearch,
  title,
}: {
  search: string;
  clearSearch: () => void;
  title: string;
}) {
  return (
    <section className="q-empty">
      <div className="q-empty-art">
        <FiInbox />
        <span>
          <FiCheck />
        </span>
      </div>
      <h2>{search ? 'Nothing by that name' : title}</h2>
      <p>
        {search
          ? 'Try another title or file name.'
          : 'Bring an ad, email, or campaign. Get a first read, then make the call.'}
      </p>
      {search ? (
        <button className="cp-button" onClick={clearSearch}>
          Clear search
        </button>
      ) : (
        <Link href="/submit" asChild>
          <a className="cp-button primary">
            <FiPlus />
            New submission
          </a>
        </Link>
      )}
    </section>
  );
}
