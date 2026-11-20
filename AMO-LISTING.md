# Nightcade: Firefox Add-ons (AMO) listing text

## Name
Nightcade

## Summary (max 250 characters)
Retro-arcade dark mode for every website. 26 themes plus a Custom theme with your own colors, light and dark faces, per-site rules, and smart color mapping that keeps photos and logos looking right. Works on Firefox and Firefox for Android.

## Description
Nightcade gives every website a dark (or light) look in one of 26 retro-arcade color themes, including Cyberpunk and a true-black AMOLED theme.

**What it does**
- Custom theme: pick your own colors for everything (main colors, plus advanced ones), separately for the dark and light face. It starts as a copy of any theme.
- Recolors pages with a single engine that rewrites the page's own colors, so photos stay real and text stays readable.
- Themes buttons, links, borders, form controls and selection colors, not just backgrounds. Choose exactly which elements get themed.
- System, Light or Dark face, shared by the popup and the pages. Sites that only come in dark can be flipped to a light face.
- Per-site rules: add sites to an Enabled or Disabled list, or turn Nightcade off or on for the current site in one tap.
- Color tuning (brightness, contrast, sepia, grayscale), page text size, optional page backdrop patterns.
- Image options: dim images, and keep logos and diagrams readable.
- Dark PDF viewing.
- Two popup styles, Arcadia and Cyberpunk.
- Keyboard shortcuts on desktop: Alt+Shift+D (this site) and Alt+Shift+G (everywhere).

**Privacy**
Nightcade collects nothing. There is no analytics, no account and no server. Settings stay in your browser's local extension storage.

**Good to know**
- Browser pages (about:, the add-ons site) can't be themed by any extension.
- If one site looks wrong, add it to the Disabled list.

## Categories
Appearance

## Support / homepage
(add your repository or contact link)

## Privacy policy (paste into the privacy policy field)
Nightcade does not collect, store off-device, sell or share any personal data. All settings (theme, per-site rules, tuning options) are saved only in your browser's local extension storage and never leave your device. Nightcade makes no network requests of its own, except that, when a page's stylesheet is hosted on another domain and cannot be read directly, it asks the browser to download that same stylesheet so it can be recolored. The downloaded stylesheet text is used in memory only and is not stored or sent anywhere.

## Notes to the reviewer
- Source: the extension is not minified or bundled. `build.js` only copies `src/` and writes the manifest. Run `node build.js`; no dependencies.
- `<all_urls>` host permission and the content script on all pages are the core function: the content script recolors the pages the user visits. All processing happens locally.
- The background script (a) answers the popup, (b) handles the two keyboard commands, and (c) fetches cross-origin stylesheet text for the content script so it can be recolored (`nc-fetch-text`). It sends nothing anywhere else.
- `storage` is used for settings only.
- `data_collection_permissions`: none.
- Lint: the only warnings are for `dom.openOrClosedShadowRoot`, an optional, feature-checked call that Firefox does not provide.
- To test: install, open any website, use the toolbar popup to switch themes, then open Site rules to try Enabled and Disabled lists.

## Version notes (1.0.0)
First release.
