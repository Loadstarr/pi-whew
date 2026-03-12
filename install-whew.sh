#!/bin/sh
# Install the whew CLI globally
cd "$(dirname "$0")/pi-mono/packages/whew" || exit 1
npm run build && npm link
echo "whew has been installed. Run 'whew' to start."
