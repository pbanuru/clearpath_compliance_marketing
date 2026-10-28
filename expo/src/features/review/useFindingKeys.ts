import { useEffect } from 'react';
import type { Finding } from './model';

export function useFindingKeys(
  findings: Finding[],
  selected: Finding | undefined,
  editable: boolean,
  onSelect: (finding: Finding) => void,
  onEdit: (finding: Finding) => void,
) {
  useEffect(() => {
    function handle(event: KeyboardEvent) {
      const target = event.target;
      if (
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        document.querySelector('dialog[open]') ||
        (target instanceof HTMLElement &&
          target.closest('input, textarea, select, [contenteditable="true"]'))
      )
        return;
      const key = event.key.toLowerCase();
      const index = findings.findIndex((f) => f._id === selected?._id);
      if (['j', 'k', 'arrowdown', 'arrowup'].includes(key) && findings.length) {
        event.preventDefault();
        const next = Math.max(
          0,
          Math.min(findings.length - 1, index + (key === 'j' || key === 'arrowdown' ? 1 : -1)),
        );
        const finding = findings[next];
        if (finding) onSelect(finding);
      } else if (editable && selected && ['a', 'd', 'e', 'u'].includes(key)) {
        event.preventDefault();
        if (key === 'e') onEdit(selected);
        else {
          const action = key === 'a' ? 'accept' : key === 'd' ? 'dismiss' : 'reopen';
          document
            .querySelector<HTMLButtonElement>(`#finding-${selected._id} [data-triage="${action}"]`)
            ?.click();
        }
      }
    }
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [findings, selected, editable, onSelect, onEdit]);
}
