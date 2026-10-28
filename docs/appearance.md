# App appearance

The signed-in home page is the Review Queue. The sidebar contains New submission,
queue filters with live counts, and Policies, below the ClearPath header, account
control, and color-mode toggle. Signed-out visitors see the introduction and a
Sign in to start button.

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
never placed in that script or public HTML. The toggle is one button holding both
icons and both labels; CSS shows the pair for the theme it switches to before
hydration, so its icon and accessible name always describe the action it
performs, and keyboard focus stays on it after each switch.

The generated transparent source mark is preserved in
`expo/assets/brand/clearpath-mark.png`. The smaller public header image and PNG
and ICO favicons are mechanical reductions of that artwork. The brand accent is
`#ff103f`; body text uses the theme's neutral foreground for readability.

Review pages use two independently scrolling panels at desktop widths of at least
1024px: material on the left and findings on the right, with the decision bar
pinned below the findings. On phones a sticky Material / Findings control switches
between the panels. Location selection switches the asset and moves to its quote,
region, PDF page, or recording time. Selected findings and accepted/dismissed
states have distinct borders and text labels, in addition to color.

Severity, status, quote highlighting, and selected controls use semantic `--cp-*`
tokens defined in `theme.css` for both light and dark modes. Product choices are
bordered radio options with accent selection, one tab stop, and arrow/Home/End
navigation. Native modal dialogs contain keyboard focus and close with Escape.
All animations respect reduced motion.

Example cards preview the actual bundled material. The mortgage first-page and
video-poster JPEGs are mechanical derivatives of the supplied PDF and video; the
ad card uses the supplied PNG, and the email card shows its original copy.
