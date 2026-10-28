# Source this file to add ClearPath development commands.
if [ -n "${ZSH_VERSION:-}" ]; then
  _CLEARPATH_ROOT="$(cd -- "$(dirname -- "${(%):-%x}")" && pwd)"
else
  _CLEARPATH_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
fi

clearpath-web() (
  cd -- "$_CLEARPATH_ROOT" || return
  echo "Starting the ClearPath web development server. Ctrl-C stops it."
  npm run dev:web -- "$@"
)

clearpath-backend() (
  cd -- "$_CLEARPATH_ROOT" || return
  echo "Starting Convex development sync. Ctrl-C stops it."
  npm run dev:backend -- "$@"
)

clearpath-check() (
  cd -- "$_CLEARPATH_ROOT" || return
  echo "Checking ClearPath code, types, formatting, and dependencies."
  npm run check -- "$@"
)

clearpath-deploy() (
  cd -- "$_CLEARPATH_ROOT" || return
  echo "Deploying Convex production and the ClearPath Cloudflare web app."
  npm run deploy:web -- "$@"
)
