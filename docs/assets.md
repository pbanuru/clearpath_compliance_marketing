# Asset storage

The signed-in home workspace accepts images, audio, browser-decodable video,
PDFs, and pasted text. Each save creates an immutable asset version. A video
requires a JPEG poster captured by the browser. A single decoding session also
captures up to 16 JPEG frames, evenly spaced from the first to the last second,
with maximum width 768px and quality 0.8. The original, poster, and frames remain
separate private R2 objects. Frame metadata includes its time in seconds; the
optional field keeps existing version-1 video records valid. Cards load posters,
not video bodies. Unsupported video codecs produce an explicit error before an upload is claimed.

The assets schema is a discriminated union. Text and media are basic kinds;
document and webpage are composite kinds that can reference extracted asset
parts while retaining their original presentation. The initial document flow
stores a PDF with no extracted parts. The [review pipeline](review-flow.md) uses
timestamped transcription and sampled frames for AI review, with versioned
resubmission and human decisions. Webpage capture, OCR extraction, and shared-team
collaboration are not implemented.

## Private storage configuration

Mount the `@convex-dev/r2` component. Each deployment requires `R2_BUCKET`,
`R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY`. Credentials belong
only in the matching Convex deployment. Use distinct private development and
production buckets and bucket-scoped Object Read & Write credentials.

Bucket CORS must allow the live Worker origin and intended local development
origin, methods `GET`, `HEAD`, and `PUT`, and headers `Content-Type` and
`If-None-Match`. Do not enable public bucket access. No Worker storage binding
or public media hostname is required.

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
   including frames, inserts the asset, and binds its ID to the claim. Repeated finalization returns that same
   asset ID. Failed uploads can renew URLs for the same claim and retry; an
   already accepted object returns a precondition failure and is then verified.
4. Indexed metadata pagination subscribes to the owner's assets. Access queries
   verify ownership before issuing 15-minute original/poster GET URLs. Opening
   a preview requests fresh URLs. There is no public object-key signing endpoint.

Original bytes are not buffered through the Worker or stored in Convex
documents. Failed or abandoned claims and their partial objects are retained;
there is no automatic cleanup or delete control. The uploader owns access until
team review permissions are implemented.

## Verification

`npm run test:assets` tests authentication, owner isolation, poster requirements,
signed upload headers, metadata validation, and idempotent finalization using
Convex's test runtime and the R2 component. Live verification must also exercise
real browser decoding, private R2 uploads, a second PUT returning 412, video
poster persistence after reload, and media playback on mobile and desktop.
