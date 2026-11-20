# Nightcade

Retro-arcade dark mode for every website. Works in Chrome, Edge, Brave, Opera, Vivaldi, Arc and Firefox from one codebase.

Nightcade does **not** invert the page. It reads the colors a site actually uses and maps each one to a dark equivalent, so photos, video and artwork stay untouched.

## Install

Run `node build.js` first if `dist/` is missing (Node 18+, no dependencies). It writes `dist/chromium`, `dist/firefox` and a `.zip` for each.

**Chrome / Edge / Brave / Opera / Vivaldi / Arc**
1. Open `chrome://extensions` (Edge: `edge://extensions`), turn on **Developer mode**.
2. Click **Load unpacked** and pick `dist/chromium`.
3. For local files (`file:///...`): open the extension's **Details** and turn on **Allow access to file URLs**. Browsers don't let an extension enable this by itself. The popup shows a reminder on local files when it is off.

**Firefox**
1. Open `about:debugging#/runtime/this-firefox` and click **Load Temporary Add-on**, then pick `dist/firefox/manifest.json`.
2. For a permanent install, sign the `nightcade-firefox-*.zip` through addons.mozilla.org (unlisted is fine).
3. Firefox may ask you to grant "access to all sites" under the extension's permissions. Nightcade needs it to run everywhere.

Shortcuts: `Alt+Shift+D` toggles the current site, `Alt+Shift+G` toggles everything (on Mac: `Control+Shift+D` and `Control+Shift+G`). Change them in your browser's extension shortcut settings.

## What it does

**Engine**
- Rewrites colors in stylesheets (including cross-origin ones, `@import`, `@layer`, `@media`, `@container`, nested CSS), inline styles, CSS variables, keyframes, SVG attributes and legacy `bgcolor`/`<font color>`.
- Handles shadow DOM, content added later, and CSS-in-JS (`insertRule`).
- Follows the colors of the chosen theme, in the **dark** face or the theme's **light** face (System / Light / Dark, shared with the popup). Light face tints light sites with the theme's paper tones. Dark areas of a site stay dark there.
- **AMOLED** is a true-black theme with no light face; choosing it forces the dark face everywhere.
- Already-dark sites are recolored to the theme too, never skipped.
- Brand colors keep their identity, borders stay visible, tinted alert boxes stay tinted, and rules that set both background and text are checked for contrast.
- Images (dark face): photos are left alone. Dark-on-transparent logos and white-background charts are detected by sampling pixels and fixed. Optional dimming.

**Popup**: one scrolling settings list. Search box, grouped rows with chevrons that open option sheets or sub-pages. Per-site switch, UI style (Arcadia or Cyberpunk), theme face, text size, a scrolling line of 26 color themes, a scrolling line of page backdrops, color tuning (brightness / contrast / sepia / grayscale), image handling, apply-to mode, site rules, reset.

## Known limits

- Browser pages (`chrome://`, the Web Store, `about:`) can't be themed by any extension.
- Images set as CSS `background-image` are left untouched (that keeps hero photos real, but dark icons used as backgrounds are not inverted).
- Firefox can't see closed shadow roots, and it uses `<style>` elements, so a very strict page CSP can block them. If a site looks wrong, exclude it under **Site rules**.
- No dark-mode extension is perfect on every site.

## Project layout

```
dist/ (generated) manifest.json is created per browser by build.js
src/background.js defaults, shortcuts, badge, cross-origin fetch proxy
src/content/      color.js (color math + mapper), engine.js (page engine)
src/popup/        popup UI (retro design language)
src/shared/       themes + settings model
tools/            icon generator
```

Settings are stored locally in the browser (`storage.local`).
