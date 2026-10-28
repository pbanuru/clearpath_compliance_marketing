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
Details, and the example Guide pill. Submission time disappears first as space
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

The example guide uses a native popover, with outside-click and Escape dismissal
and standard keyboard activation. Four implemented review-loop steps include
their hints; the future policy-update step stays hidden. Hide guide retains the
existing `clearpath-learning-example-guide` preference.

The decision bar pinned by the layout is one 55px row: reviewed progress, an
optional inline note, Approve, and the decision overflow menu. Accepted findings prevent approval;
Request changes remains available in the overflow menu. Approving with unreviewed
findings opens a confirmation that explains that those findings will be marked
not raised. Notes stay with the eventual decision when their field is collapsed.
