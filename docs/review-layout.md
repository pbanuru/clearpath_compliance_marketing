# Review screen layout

The review route prioritizes the submitted resources. At 1000px wide and above,
show the resource viewer beside the findings column, with the sidebar initially
collapsed to its icon rail. Review routes keep that arrangement down to 768px;
other routes retain their existing sidebar breakpoint. An explicit sidebar
choice is saved in `clearpath-sidebar-expanded` and takes precedence on every
route. Phones use the existing navigation drawer and Material / Findings switch.

The review header is one compact row: back link, truncating title and status
chips, product, channel, states, V1 (or the selected version), submission time,
Details, and the example Guide pill. Submission time disappears first as space
narrows, followed by states. At smaller widths all metadata moves into Details.
The title and chips stay visible. Phones use two lines. Details also contains
submission context and the full title. Its popover moves with the page so long
notes remain reachable through the existing page scroll. AI cost remains recorded by the backend
and is not displayed in the review header or Details.

A single resource has no file row. Multiple resources have chips within the top
edge of the viewer: type icon, truncated filename, and plain finding count.
Arrow keys select adjacent resources, and selecting a finding selects its
resource. There is no Material heading. The viewer stays sticky while the page
scrolls. Images and recordings fit the available viewport space; long text and
transcripts remain part of the page scroll. The [PDF viewer](pdf-viewer.md) uses
that same available space for its own page scroller, keeping page/zoom controls
visible while a finding reveals its page and quote.

The example guide uses a native popover, with outside-click and Escape dismissal
and standard keyboard activation. Four implemented review-loop steps include
their hints; the future policy-update step stays hidden. Hide guide retains the
existing `clearpath-learning-example-guide` preference.

The sticky decision bar is one 55px row: reviewed progress, an optional inline
note, Approve, and the decision overflow menu. Accepted findings prevent approval;
Request changes remains available in the overflow menu. Approving with unreviewed
findings opens a confirmation that explains that those findings will be marked
not raised. Notes stay with the eventual decision when their field is collapsed.
