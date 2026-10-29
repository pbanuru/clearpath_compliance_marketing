# App appearance

The signed-in home page is the Review Queue. The sidebar contains New submission,
queue filters with live counts, and Policies, below the ClearPath header, account
control, and color-mode toggle. Signed-out visitors see the introduction and a
Sign in and Create account buttons, with a real review-screen preview. After the
account is known to be signed out, the landing fills the page without a sidebar
or phone drawer toggle. Session loading reserves the signed-in rail with a quiet
skeleton. The light and dark WebP previews are actual social-example captures.

The sidebar follows LyricWinter Studio's shell: a 224px rail at desktop widths
of at least 1024px, collapsed to 40px, and an initially closed phone drawer up to
320px or 88% of the viewport. Desktop expansion and phone opening are independent.
The phone drawer covers the header with a backdrop, keeps keyboard focus inside,
and closes through its toggle, the backdrop, or Escape. Closing restores focus
to its opener. The sidebar body and page content scroll independently. The collapsed desktop
rail keeps the navigation icons, accessible names, and native tooltips. Navigation
closes the phone drawer. CSS handles the first paint at either width,
and reduced-motion preferences remove the 300ms transitions.

The sun and moon are the same Feather icons used by LyricWinter's header,
provided by `react-icons/fi`. The account control receives live account state
and actions from the authentication provider; it does not own sessions.

Color mode defaults to dark, independent of the browser's system preference,
until someone selects light or dark. That choice is stored locally as `clearpath-theme`. A small script in
`+html.tsx` restores only this preference before paint; account information is
never placed in that script or public HTML. The toggle is one button holding both
icons and both labels; CSS shows the pair for the theme it switches to before
hydration, so its icon and accessible name always describe the action it
performs, and keyboard focus stays on it after each switch.

The generated transparent source mark is preserved in
`expo/assets/brand/clearpath-mark.png`. The smaller public header image and PNG
and ICO favicons are mechanical reductions of that artwork. The brand accent is
`#ff103f`; body text uses the theme's neutral foreground for readability.

Review pages use independently scrolling material and findings panes on desktop,
with a decision bar pinned below. Phones use one combined scroller. Location
selection moves to its quote, region, PDF page, or recording time. Findings have
separate bordered summaries with visible chevrons; selecting a summary opens or
closes its details. Underlined rule references open independently and can include
several saved policy versions. See [review layout](review-layout.md) for pane,
header, and disclosure behavior.

Severity, status, quote highlighting, and selected controls use semantic `--cp-*`
tokens defined in `theme.css` for both light and dark modes. Product choices are
bordered radio options with accent selection, one tab stop, and arrow/Home/End
navigation. Native modal dialogs contain keyboard focus and close with Escape.
All animations respect reduced motion.

Example cards preview the actual bundled material. The mortgage first-page and
video-poster JPEGs are mechanical derivatives of the supplied PDF and video; the
ad card uses the supplied PNG, and the email card shows its original copy.
Starting an example shows its preparation message, animated spinner, and elapsed
time on that card. Other cards are disabled until it finishes; there is no
separate progress line below the grid or wait cursor.

The review header keeps its title and status together, with context and version
metadata moving into Details at smaller widths. Decision notes expand on demand;
revision responses preserve entered text when collapsed. The decision bar remains
visible while the material or findings scroll.

Pressing ? outside a field opens the keyboard reference; the sidebar also exposes
it. The native sheet traps focus, closes with Escape, and restores the opener.

Light mode uses cool neutral page surfaces, white cards, quiet borders, and soft
shadows. Queue findings use neutral text counts; the filtered review queue omits
the redundant Needs review label. Links and focus rings use the theme tokens.
The primary button uses the brand accent.
