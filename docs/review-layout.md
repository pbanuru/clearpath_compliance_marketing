# Review screen layout

The review route fills `100dvh` without scrolling the document or app content.
The global header, sidebar, review header, and decision bar stay in the layout.
Above 700px, only the resource pane and findings pane scroll, independently.
PDF pages use the resource pane's scroll rather than a nested PDF scroller.
At 700px and below, resources precede findings in one combined scroller between
the headers and decision bar. There is no Material / Findings switch. Other
routes retain their existing page scroll and sidebar breakpoint.

The review sidebar defaults to its icon rail. An explicit choice is saved in
`clearpath-sidebar-expanded`. Navigation keeps the same icon padding while the
sidebar changes width; labels and counts clip inside their rows. The drawer
uses that same icon column, including New submission and Keyboard shortcuts.

The review header is one compact row: back link, truncating title and status
chips, product, channel, states, V1 (or the selected version), submission time,
and Details. Submission time disappears first as space
narrows, followed by states. At smaller widths all metadata moves into Details.
The title and chips stay visible. Phones use two lines. Details also contains
submission context and the full title. Its popover shares the findings pane (or
the combined phone pane), so long notes remain reachable without creating another scroll region. Closing it
restores that pane's previous scroll position. AI cost remains recorded by the
backend and is not displayed in the review header or Details.

A single resource has no file row. Multiple resources have chips within the top
edge of the viewer: type icon, truncated filename, and plain finding count.
Arrow keys select adjacent resources, and selecting a finding selects its
resource. There is no Material heading. The panes fill the space left by the
fixed headers and decision bar. The resource pane scrolls long images, captures,
text, transcripts, and PDF pages. Finding selection reveals its highlight
inside that pane and its card inside the findings pane. Scroll padding keeps
focus rings and PDF highlights clear of pane edges and PDF controls.

Captured webpages share the resource pane's scroll, without a nested scroller,
with a compact source URL, capture time, and live-page link. All measured finding
boxes are selectable and use the same severity/selection styling as image findings.
Selecting a card reveals its box; selecting a box reveals its finding card. The
page capture keeps its natural aspect ratio rather than shrinking a long page to
the height of the viewport.

Findings are separate accordion items with a full-width summary target and a visible
chevron. Enter, Space, or a pointer press opens and closes the details. Rule
references remain underlined and open their saved source passages independently,
including while the finding is collapsed. Multiple rules appear as separate
references; each opens its own saved version and source link. The finding editor
can add or remove references. Inline passages stay open during interactions within
the findings pane so closing one cannot move another control out from under a press.
The explanation and triage controls are separate from the disclosure target; text selection and action clicks do not close it.
On a phone, opening a finding keeps its card in view while preserving its source
highlight; automatic material reveal does not pull the shared scroller back to
the resource. Selecting source evidence still opens the corresponding finding.

The decision bar pinned by the layout is one 55px row: reviewed progress, an
optional inline note, Approve, and the decision overflow menu. Accepted findings prevent approval;
Request changes remains available in the overflow menu. Approving with unreviewed
findings opens a confirmation that explains that those findings will be marked
not raised. Notes stay with the eventual decision when their field is collapsed.

During analysis, the checking state has an animated activity indicator and elapsed
time from the analysis start. A queued check counts from when the state appears.
Elapsed time stops updating when the checking state is removed.

The recording timeline supports clicking empty track, dragging the playhead, and
keyboard seeking through a native range control. Finding segments still select
their findings. Playback paints the playhead at animation-frame cadence rather
than rounding to whole seconds.
