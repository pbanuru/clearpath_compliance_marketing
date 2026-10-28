# Asset storage

The signed-in home workspace accepts images, audio, browser-decodable video,
PDFs, pasted text, and web pages captured by URL. Each save creates an immutable asset version. A video
requires a JPEG poster captured by the browser. A single decoding session also
accepts videos up to three minutes and captures one JPEG frame per second,
with maximum width 480px and quality 0.7. Browser metadata is checked before any
upload; the backend confirms the transcription provider's duration before review.
Over-limit or unverified videos do not receive an AI review. The original, poster, and frames remain
separate private R2 objects. Frame metadata includes its time in seconds; the
optional field keeps existing version-1 video records valid. Cards load posters,
not video bodies. Unsupported video codecs produce an explicit error before an upload is claimed.

The assets schema is a discriminated union. Text and media are basic kinds;
document and webpage are composite kinds that can reference extracted asset
parts while retaining their original presentation. The initial document flow
stores a PDF with no extracted parts. The [review pipeline](review-flow.md) uses
timestamped transcription and sampled frames for AI review, with versioned
resubmission and human decisions. Web pages retain their rendered screenshot and
positioned DOM text. OCR extraction and shared-team collaboration are not implemented.

## Web pages by URL

`POST /api/capture` runs in the Worker with the `BROWSER` binding and
`@cloudflare/puppeteer`. It reuses WorkOS sealed-session authentication and cookie
refresh; unauthenticated requests receive 401. Only HTTP(S) URLs without embedded
credentials are accepted. Responses, including failures, are `private, no-store`.
The captured browser starts a fresh session; the submitter's cookies are not sent
to the destination.

The browser renders at 1440×900, waits for network idle within a 30-second loading
budget, visits overlapping viewports through the capture range to settle lazy
content, returns to the top, and saves a quality-80 JPEG. The screenshot stops at
12,000 pixels; `heightTruncated` makes that limit
visible to the reviewer and model. Visible DOM text blocks include their measured
page-pixel boxes. Hidden, clipped screen-reader text, zero-size blocks, and nested
duplicates are excluded. Blocks crossing any screenshot boundary are omitted so
unseen text cannot be verified against a clipped box. Text ranges must also fit
each ancestor's CSS overflow clipping box; line-clamped or masked text is omitted
conservatively. Blocks retain DOM reading
order. The smallest boxes are
dropped first to stay within 1,500 blocks and 180,000 UTF-8 JSON bytes;
`blocksTruncated` records that loss. This is DOM extraction, not OCR.

The client creates JPEG tiles of at most 1440×1800 from the screenshot and uses the
existing signed upload flow for the screenshot and tiles. The public action
`assets.createWebpage({uploadId, sourceUrl, finalUrl, title, size, blocks,
browserMs, capturedAt?, blocksTruncated?, heightTruncated?})` checks ownership
before syncing R2 metadata. Its commit transaction verifies every object's size
and MIME, checks contiguous tile coverage, creates the immutable `webpage` asset,
binds the claim, and records one capture span. Repeating finalization returns the
same asset without another span. Added content fields are optional so earlier
webpage records remain valid. `parts` remains available for future extraction.

The capture span has provider `cloudflare`, operation `page_capture`, model
`browser-run`, `assetId`, and browser milliseconds measured from launch through
close. It has no review ID because capture precedes submission. Daily usage
includes these spans. The estimate is $0.09/browser-hour, with a pricing-version
note that Workers Paid includes ten hours/month and the marginal charge may be
zero. Concurrent-browser charges are outside this duration estimate. See
[Browser Run pricing](https://developers.cloudflare.com/browser-run/pricing/).

Queue thumbnails show the screenshot's top. The material viewer scales its natural
width to fit the resource pane, displays the source and capture time, opens the
live destination separately, and scrolls the selected finding's measured region
into view using the resource pane's scroll (the combined pane on phones), without
a nested screenshot scroller. In the resource-only left area, every located finding has
an exact clickable box linked to the finding cards, with severity and selected
state matching other resources. The frozen screenshot remains the evidence even
if the live page changes.

For local development use Puppeteer with `wrangler dev`, without `remote: true` or
Quick Actions. See [Browser Run's Wrangler reference](https://developers.cloudflare.com/browser-run/reference/wrangler/).
On yn, Chromium needs Wrangler's `CI=true` launch mode because its normal Linux
sandbox is unavailable. A local test harness can exercise browser work without
minting a WorkOS cookie; this does not establish authenticated endpoint coverage.

## Private storage configuration

Mount the `@convex-dev/r2` component. Each deployment requires `R2_BUCKET`,
`R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY`. Credentials belong
only in the matching Convex deployment. Use distinct private development and
production buckets and bucket-scoped Object Read & Write credentials.

Bucket CORS must allow the live Worker origin and intended local development
origin, methods `GET`, `HEAD`, and `PUT`, and headers `Content-Type` and
`If-None-Match`. Do not enable public bucket access. No Worker storage binding
or public media hostname is required. The current DEV bucket allows
`http://localhost:8081`; use that origin for browser upload verification on yn.

## Upload and access

1. An authenticated mutation derives `tokenIdentifier`, assigns random object
   keys, and saves a claim describing the original, required poster, and optional
   frame objects. The browser never supplies an owner or chooses an object key.
2. The browser sends bytes directly to R2 using 15-minute signed PUT URLs. MIME
   type, byte length, and `If-None-Match: *` are signed. Conditional writes make
   the original immutable even if a signed URL is reused. The single-PUT R2
   platform limit is exactly 5 GiB minus 5 MiB (5,363,466,240 bytes, approximately
   4.995 GiB), per [Cloudflare's platform limits](https://developers.cloudflare.com/r2/platform/limits/).
   Multipart uploads are not implemented.
3. Finalization checks claim ownership before syncing object metadata through
   the R2 component. A transaction checks observed size and MIME for every object
   including frames or page tiles, inserts the asset, and binds its ID to the claim. Repeated finalization returns that same
   asset ID. Each upload call processes and returns only its selected files.
   Failed items remain visible but run again only through their per-item Retry
   control, which renews URLs for the same claim. Selecting another replacement
   for the same original discards the failed selection. An
   already accepted object returns a precondition failure and is then verified.
4. Indexed metadata pagination subscribes to the owner's assets. Access queries
   verify ownership before issuing 15-minute original/poster GET URLs. Opening
   a preview requests fresh URLs. There is no public object-key signing endpoint.

Uploaded original files bypass the Worker. Generated page screenshots pass through
the capture response to the client before their signed R2 upload; image bytes are
not stored in Convex documents. Failed or abandoned claims and their partial objects are retained;
there is no automatic cleanup or delete control. The uploader owns access until
team review permissions are implemented.

## Verification

`npm run test:assets` tests authentication, owner isolation, poster requirements,
signed upload headers, metadata validation, page-capture spans, measured quote
anchoring, and idempotent finalization using
Convex's test runtime and the R2 component. Live verification must also exercise
real browser decoding, private R2 uploads, a second PUT returning 412, video
poster persistence after reload, and media playback on mobile and desktop.
