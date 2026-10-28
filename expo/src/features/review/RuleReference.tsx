import { useId, useRef, useState } from 'react';
import { FiExternalLink } from 'react-icons/fi';
import './rule-reference.css';
import { useDismissable } from '@/components/overlays/useDismissable';

export function RuleReference({
  title,
  label,
  excerpt,
  url,
}: {
  title: string;
  label: string;
  excerpt?: string;
  url: string | null;
}) {
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const content = useRef<HTMLElement>(null);
  useDismissable({ open: expanded, onClose: () => setExpanded(false), content, trigger });
  return (
    <>
      <button
        ref={trigger}
        className="cp-rule-reference"
        type="button"
        aria-expanded={expanded}
        aria-controls={id}
        onClick={() => setExpanded(!expanded)}
      >
        {label}
      </button>
      <section
        ref={content}
        className="cp-rule-passage"
        id={id}
        aria-label={title}
        hidden={!expanded}
      >
        <h3>{title}</h3>
        {excerpt && <blockquote>“{excerpt}”</blockquote>}
        <p className="cp-rule-citation">{label}</p>
        {url && (
          <a href={url} target="_blank" rel="noreferrer" onClick={() => setExpanded(false)}>
            Open at source <FiExternalLink aria-hidden="true" />
          </a>
        )}
      </section>
    </>
  );
}
