import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { UploadBox } from './UploadBox';

function render(item) {
  return renderToStaticMarkup(
    createElement(UploadBox, {
      uploads: {
        busy: false,
        items: [{ key: 'failed', name: 'Offer', progress: 0, error: 'Interrupted', ...item }],
      },
    }),
  );
}
describe('upload retry controls', () => {
  it('gives failed webpage captures only the capture retry control', () => {
    const html = render({ sourceUrl: 'https://example.test/' });
    expect(html).toContain('Retry capture');
    expect(html).not.toContain('>Retry</button>');
    expect(html).toContain('Capture failed');
  });
  it('keeps the file retry control for failed file uploads', () => {
    const html = render({});
    expect(html).toContain('>Retry</button>');
    expect(html).not.toContain('Retry capture');
    expect(html).toContain('Upload failed');
  });
});
