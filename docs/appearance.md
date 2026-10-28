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

Color mode follows the browser's system preference until someone selects light
or dark. That choice is stored locally as `clearpath-theme`. A small script in
`+html.tsx` restores only this preference before paint; account information is
never placed in that script or public HTML. CSS chooses the matching icon before
hydration, so the visible button always names the action it performs.

The generated transparent source mark is preserved in
`expo/assets/brand/clearpath-mark.png`. The smaller public header image and PNG
and ICO favicons are mechanical reductions of that artwork. The brand accent is
`#ff103f`; body text uses the theme's neutral foreground for readability.

Review pages use two independently scrolling panels at desktop widths of at least
1024px: material on the left and findings on the right, with the decision bar
pinned below the findings. On phones a sticky Material / Findings control switches
between the panels. Location selection switches the asset and moves to its quote,
region, PDF page, or recording time. Findings use compact rows with inline
Accept and Dismiss controls; only the selected row expands its details. Reviewed
counts and explicit status labels keep triage progress visible. The first required
finding is selected when a review opens. Text, image, and recording highlights use
the severity color and a stronger selected outline.

Severity, status, quote highlighting, and selected controls use semantic `--cp-*`
tokens defined in `theme.css` for both light and dark modes. Product choices are
bordered radio options with accent selection, one tab stop, and arrow/Home/End
navigation. Native modal dialogs contain keyboard focus and close with Escape.
All animations respect reduced motion.

Example cards preview the actual bundled material. The mortgage first-page and
video-poster JPEGs are mechanical derivatives of the supplied PDF and video; the
ad card uses the supplied PNG, and the email card shows its original copy.

The review header keeps its title and status together, then shows version,
submitted time, and AI cost on one metadata line. A compact decision row stays
below the findings and above the phone safe area. Approve remains secondary while
required findings are unreviewed, with a confirmation explaining they will be
marked not raised. Decision notes expand on demand. Revision responses use
collapsible checklist rows, preserving entered text when closed.

Example reviews have a dismissible five-step guide derived from triage, decisions,
and versions. Its dismissal and the three first-use tips persist per browser.
The final rule-change step remains Coming next until a showcase is available.
Pressing ? outside a field opens the keyboard reference; the sidebar also exposes
it. The native sheet traps focus, closes with Escape, and restores the opener.
