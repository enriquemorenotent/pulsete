# Desktop browser regression tests

Run `npm run test:browser` with Google Chrome installed. For a visible browser,
run `npm run test:browser -- --headed`.

Playwright starts an isolated Vite server on `127.0.0.1:18474` and opens a
1280×900 Chrome window. The fixture uses the real `ChatTranscriptVirtuoso`,
message rows, styles, and scrolling hooks with deterministic messages. It does
not connect to IRC, touch the local database, or install the desktop application.

The tests cover tab return near the bottom, exact visible-row restoration,
incoming output while reading, wheel and keyboard scrolling, prepending older
messages, bounded older/newer windows, automatic history loading, message jumps,
and returning to latest. Console errors and Vite error overlays fail the tests.
Failure screenshots go to `/tmp/pulsete-playwright`; the successful history-view
screenshot goes to `/tmp/pulsete-transcript-history.png`.

The media-preview fixture also checks account pictures, user avatars, DM profile
pictures, and message images against the shared viewer: full-size loading, original
links, account routing, Escape, outside-click closing, and missing-picture menus.
