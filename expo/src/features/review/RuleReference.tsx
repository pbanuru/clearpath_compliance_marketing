import { useId, useRef, useState, type RefObject } from 'react';
import { FiExternalLink } from 'react-icons/fi';
import './rule-reference.css';
import { useDismissable } from '@/components/overlays/useDismissable';

export function RuleReference({
  title,
  name,
  label,
  excerpt,
  url,
  dismissBoundary,
}: {
  title: string;
  name?: string;
  label: string;
  excerpt?: string;
  url: string | null;
  dismissBoundary?: RefObject<HTMLElement | null>;
}) {
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const content = useRef<HTMLElement>(null);
  useDismissable({
    open: expanded,
    onClose: () => setExpanded(false),
    content: dismissBoundary ?? content,
    trigger,
  });
  return (
    <>
      <button
        ref={trigger}
        className="cp-rule-reference"
        type="button"
        aria-expanded={expanded}
        aria-controls={id}
        aria-label={name ? `${name} · ${label}` : undefined}
        onClick={() => setExpanded(!expanded)}
      >
        {name && <span className="cp-rule-name">{name}</span>}
        <span>{label}</span>
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
