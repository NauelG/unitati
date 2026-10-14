/**
 * Theme system support code (#90): the pieces that are plain TypeScript, not
 * markup, so they are testable without a browser. Sibling of `motion.ts`, and
 * the same shape — a vocabulary plus the few literals CSS cannot hand to JS.
 *
 * The *values* of the theme live in `src/app.css` (`:root` and `.dark`),
 * transcribed from `docs/design/assets/tokens.json`. Nothing here restates a
 * colour except the two canvas hexes below, which have a stated reason.
 */

import type { UserPrefersMode } from 'mode-watcher';

/**
 * mode-watcher's own `'light' | 'dark' | 'system'`, reached through the class
 * that owns it: the package exports the `UserPrefersMode` type but not the
 * `Mode` alias its `current` accessor returns, and an indexed access gets there
 * without declaring a fourth copy of a three-word union. A pure `import type`,
 * so nothing is pulled into the bundle.
 */
type Mode = UserPrefersMode['current'];

/**
 * The three choices the user is offered, in the order they appear in the menu.
 * `system` last, because it is the default and the menu reads as "or let the
 * machine decide" — and because the two explicit answers belong together.
 *
 * Exported as a list rather than inlined in the toggle so the gallery renders
 * exactly the options the shell offers: a fourth mode added to this array shows
 * up in both places, or in neither.
 *
 * `Mode` is mode-watcher's own union (`'light' | 'dark' | 'system'`), not a
 * copy. A local copy would be a second vocabulary to keep in step, and the
 * library already owns this one — the same reasoning that keeps the status keys
 * in `domain/status.ts` instead of in each layer (ADR 0011).
 */
export const THEME_MODES = ['light', 'dark', 'system'] as const satisfies readonly Mode[];

export type ThemeMode = (typeof THEME_MODES)[number];

/**
 * `<meta name="theme-color">`, one per mode: the colour a mobile browser paints
 * its own chrome — the address bar on Android Chrome, the status-bar area of an
 * installed PWA.
 *
 * These two hexes are the one deliberate duplication of a token value outside
 * `app.css`. `<meta>` takes a colour, not a custom property: `content="var(--surface-0)"`
 * is simply ignored, so there is no way to point this at the token. They mirror
 * `--surface-0` light and dark; if that token moves, move these with it.
 *
 * `--surface-0` and not `--surface-1`, because the canvas is what sits behind
 * the shell — matching the panel colour instead would draw a visible seam
 * between the browser chrome and the page edge.
 */
export const THEME_CANVAS_COLORS = {
	light: '#f5f6f8',
	dark: '#0b1016'
} as const;

/**
 * Whether a chart, badge or illustration should pick its dark palette.
 *
 * Reads the *resolved* mode (`mode.current` from mode-watcher, already
 * collapsed from `system` to the OS's actual answer), so a caller never has to
 * re-derive "system plus `prefers-color-scheme`" for itself. `undefined` during
 * SSR and the first frame, which resolves to light — the same assumption
 * `:root` makes.
 */
export function isDarkMode(resolved: 'light' | 'dark' | undefined): boolean {
	return resolved === 'dark';
}
