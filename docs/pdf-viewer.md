# PDF review viewer

PDFs render with PDF.js, loaded dynamically when a PDF thumbnail becomes visible
or a PDF is opened for review. Queue thumbnails show the actual first page and
reuse the same image for the hover preview. The browser's built-in viewer is never
embedded. In review, pages are white canvases on the app surface in both themes,
stacked inside the resource area's available height. The left viewer stays sticky beside the finding cards;
PDF pages scroll below fixed controls. Single-file reviews show only the resource,
while multi-file reviews retain the item row with file type and finding counts.
Pages fit the material width by default; the slim control
row shows the visible page count, fit width, zoom controls, and Open PDF. Zoom is
relative to fit width. Enlarged pages pan inside the preview, without widening the
review screen. Controls are native keyboard-accessible buttons and links.

Selecting a finding reveals its page and measures quote words against PDF.js's
text layer, including quotes spanning lines. Highlights share image-region
severity colors and the selected outline. A supplied normalized region is also
shown. Quotes are checked against the actual page text (PDF findings can have
`quoteFound` unset because the analysis service does not extract PDF text). An
unmatched quote, including a finding marked `quoteFound: false`, retains a page
outline with a quiet message; it never highlights unrelated words. Scanned PDFs
with no text layer use the same fallback. There is no client-side OCR.

Finding reveal scrolls both axes inside the PDF, so a selected page, quote, or
region stays visible below the controls, including when zoomed. The viewer uses
the review layout's 768px mobile breakpoint; on a phone, selecting a finding keeps
the finding card open and opening Material reveals its selected evidence.

Canvas resolution follows `devicePixelRatio`; pages render when near the viewport
or selected. Document changes destroy the old PDF.js task/worker, and resizes or
zoom changes cancel superseded render tasks. Corrupt, encrypted, or inaccessible
documents offer Open PDF and Reload preview. Reload requests a fresh signed URL.

`expo/scripts/prepare-pdf.mjs` runs before web development and export. It copies
the installed PDF.js version's worker, CMaps, fonts, and WASM into ignored
`expo/public/pdfjs/<version>/`; Expo exports these as same-origin static assets.
No CDN is used. Keep this preparation step when changing build scripts.

`npm run test:pdf` reads the bundled `mortgage-landing-page.pdf` and checks its
page count, matched word offsets across text runs, and absent-quote fallback.
Browser QA also verifies rendered canvases, overlays, reveal, and failure states.

## R2 CORS

Development bucket `clearpath-compliance-assets-dev` allows GET, HEAD, and PUT,
request headers Content-Type, If-None-Match, and Range, and exposes ETag,
Content-Length, Content-Range, and Accept-Ranges. Its existing localhost and
127.0.0.1 origins on 8081 and 8796–8810 are preserved. Verified through Wrangler.

Production bucket `clearpath-compliance-assets-prod` uses the rule in
[pdf-prod-cors.json](pdf-prod-cors.json). Inspect it, or reapply it from `expo/`, with:

```sh
npx wrangler r2 bucket cors set clearpath-compliance-assets-prod \
  --file ../docs/pdf-prod-cors.json
npx wrangler r2 bucket cors list clearpath-compliance-assets-prod
```

The exact rule allows only `https://clearpath-marketing-compliance-web.aera.workers.dev`,
preserves uploads with PUT, Content-Type and If-None-Match, adds GET/HEAD and Range,
exposes ETag, Content-Length, Content-Range and Accept-Ranges, and caches preflight
for 3600 seconds. Range is a request header, not an HTTP method. This is a private
bucket; signed URLs and ownership checks remain required.
