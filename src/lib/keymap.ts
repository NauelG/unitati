import { writable, type Readable } from 'svelte/store';

/**
 * The single source of truth for the technician's keyboard layer (#88).
 * Pure, DOM-agnostic logic so it can be unit-tested in Node (no jsdom in this
 * project — see `vite.config.ts`'s `server` test project). Anything that
 * needs a real `window`/`document` (installing the listener, detecting the
 * platform at runtime, checking for an open overlay) takes its DOM handle as
 * an argument instead of reading a global, so the same function works against
 * a real `document` in the browser and a plain object in a test.
 *
 * `scope` is a coarse grouping — "global" always matches; "list"/"record"
 * only match while that part of the screen says it is active (`activeScope`
 * below). Fine-grained availability (a permission, a selected row, a route)
 * is each entry's own `when` predicate: the registry does not know what a
 * "selected row" is, the page that registers the entry does.
 */

export type KeymapScope = 'global' | 'list' | 'record';

/**
 * One step of a chord: zero or one modifier group joined to a key by `+`,
 * e.g. `'a'`, `'$mod+k'`, `'Escape'`, `'?'`. `$mod` means ⌘ on macOS, Ctrl
 * everywhere else — never author a literal `Ctrl`/`Meta` chord, or the
 * platform split has to be redone at every call site instead of once here.
 * A `keys` array longer than one step is a *sequence* (the `g`-prefix
 * grammar): each step must be pressed within `sequenceWindowMs` of the
 * previous one.
 */
export type Chord = string;

export interface KeymapContext {
	/** Which part of the screen currently owns focus, for scope filtering. */
	scope: KeymapScope;
	/** The viewer's permissions, for `entry.permission`. */
	permissions: readonly string[];
	/** An overlay (dialog, sheet, select/search-select popover) is open. */
	overlayOpen: boolean;
	/** The event target is a text input, a textarea, or `contentEditable`. */
	typingTarget: boolean;
}

export interface KeymapEntry {
	/** Stable identity: registering the same id again replaces the entry. */
	id: string;
	keys: Chord[];
	scope: KeymapScope;
	/** Overlay grouping — "Navegación", "Activos"… never a raw scope name. */
	group: string;
	/** Shown in the `?` overlay and nowhere else. */
	label: string;
	/** `assets.manage`, or several — any one is enough. Omit for no gate. */
	permission?: string | readonly string[];
	/** An extra predicate the registry cannot express (route, selection…). */
	when?: (ctx: KeymapContext) => boolean;
	/** Runs even while the target is a text input/textarea/contentEditable. */
	allowWhileTyping?: boolean;
	/** Runs even while an overlay (dialog/sheet/popover) is open. */
	allowWhileOverlay?: boolean;
	run: (ctx: KeymapContext) => void;
}

/** Duck-typed so a test can hand this a plain object instead of a real event. */
export interface KeyboardEventLike {
	key: string;
	metaKey?: boolean;
	ctrlKey?: boolean;
	altKey?: boolean;
	preventDefault?: () => void;
}

/** Duck-typed so a test never needs `HTMLElement` to exist (no jsdom here). */
export interface TypingTargetLike {
	tagName?: string;
	isContentEditable?: boolean;
}

/** Duck-typed so a test can hand this a fake `{ querySelector }`. */
export interface OverlayHostLike {
	querySelector(selectors: string): unknown;
}

export interface NavigatorLike {
	platform?: string;
	userAgent?: string;
}

/** Every vendored overlay primitive (ADR 0011) tags its open content this way. */
const OVERLAY_CONTENT_SELECTOR = '[data-slot$="-content"][data-open]';

export function isMacPlatform(nav?: NavigatorLike): boolean {
	const source = nav ?? (typeof navigator !== 'undefined' ? navigator : undefined);
	if (!source) return false;
	const platform = source.platform ?? '';
	const userAgent = source.userAgent ?? '';
	return /Mac|iPhone|iPad|iPod/.test(platform) || /Mac OS X/.test(userAgent);
}

export function isTypingTarget(target: unknown): boolean {
	if (!target || typeof target !== 'object') return false;
	const candidate = target as TypingTargetLike;
	if (candidate.tagName === 'INPUT' || candidate.tagName === 'TEXTAREA') return true;
	return Boolean(candidate.isContentEditable);
}

export function isOverlayOpen(host: OverlayHostLike | undefined | null): boolean {
	if (!host) return false;
	return host.querySelector(OVERLAY_CONTENT_SELECTOR) !== null;
}

function normalizeKey(key: string): string {
	return key.length === 1 ? key.toLowerCase() : key;
}

/** `'$mod+k'` → `['$mod', 'k']`; `'Escape'` → `['Escape']`. */
function splitChord(chord: Chord): { modifiers: string[]; key: string } {
	const parts = chord.split('+');
	return { modifiers: parts.slice(0, -1), key: parts[parts.length - 1] ?? '' };
}

function eventMatchesChord(event: KeyboardEventLike, chord: Chord): boolean {
	const { modifiers, key } = splitChord(chord);
	const needsMod = modifiers.includes('$mod');
	const hasMod = Boolean(event.metaKey || event.ctrlKey);
	if (needsMod !== hasMod) return false;
	if (event.altKey) return false;
	return normalizeKey(event.key) === normalizeKey(key);
}

function chordsEqual(a: Chord, b: Chord): boolean {
	const left = splitChord(a);
	const right = splitChord(b);
	if (left.modifiers.includes('$mod') !== right.modifiers.includes('$mod')) return false;
	return normalizeKey(left.key) === normalizeKey(right.key);
}

const KEY_GLYPH: Record<string, string> = {
	Escape: 'Esc',
	ArrowUp: '↑',
	ArrowDown: '↑',
	ArrowLeft: '←',
	ArrowRight: '→',
	Enter: '↵'
};
// ArrowDown really is its own glyph; the table above is written out fully
// below so a future reader does not have to guess which arrow is which.
KEY_GLYPH.ArrowDown = '↓';

function formatChordStep(chord: Chord, mac: boolean): string {
	const { modifiers, key } = splitChord(chord);
	const parts: string[] = [];
	if (modifiers.includes('$mod')) parts.push(mac ? '⌘' : 'Ctrl');
	const glyph = KEY_GLYPH[key] ?? (key.length === 1 ? key.toUpperCase() : key);
	parts.push(glyph);
	// macOS chord hints read "⌘K"; everywhere else "Ctrl+K" — a glued modifier
	// symbol reads fine, a glued word does not.
	return mac ? parts.join('') : parts.join('+');
}

/** Renders a full entry (chord, or chord sequence) for the `?` overlay and inline hints. */
export function formatKeys(keys: readonly Chord[], mac: boolean): string {
	return keys.map((step) => formatChordStep(step, mac)).join(' ');
}

export class KeymapRegistry {
	private readonly entries = new Map<string, KeymapEntry>();
	private readonly store = writable<KeymapEntry[]>([]);

	/** Returns an unregister function — call it from the registering effect's teardown. */
	register(entry: KeymapEntry): () => void {
		this.entries.set(entry.id, entry);
		this.emit();
		return () => {
			this.entries.delete(entry.id);
			this.emit();
		};
	}

	snapshot(): KeymapEntry[] {
		return [...this.entries.values()];
	}

	/** A Svelte store for components (the `?` overlay) that render the live list. */
	get list(): Readable<KeymapEntry[]> {
		return this.store;
	}

	private emit(): void {
		this.store.set(this.snapshot());
	}
}

export interface KeymapRouterOptions {
	/** The `g`-prefix window (ms). 500 per the issue's own grammar (D10). */
	sequenceWindowMs?: number;
	/** Swappable for tests; defaults to the real timer functions. */
	setTimeout?: (callback: () => void, ms: number) => unknown;
	clearTimeout?: (handle: unknown) => void;
}

/**
 * Matches a keydown against a live entry list and runs the first eligible
 * match. One instance is installed on `window` by `AppShell`; entries come
 * and go as pages mount/unmount (`KeymapRegistry.register`), the router
 * itself never changes.
 */
export class KeymapRouter {
	private readonly getEntries: () => readonly KeymapEntry[];
	private readonly sequenceWindowMs: number;
	private readonly scheduleTimeout: (callback: () => void, ms: number) => unknown;
	private readonly cancelTimeout: (handle: unknown) => void;
	private pendingPrefix: Chord | null = null;
	private pendingTimer: unknown = null;

	constructor(getEntries: () => readonly KeymapEntry[], options: KeymapRouterOptions = {}) {
		this.getEntries = getEntries;
		this.sequenceWindowMs = options.sequenceWindowMs ?? 500;
		this.scheduleTimeout = options.setTimeout ?? ((callback, ms) => setTimeout(callback, ms));
		this.cancelTimeout = options.clearTimeout ?? ((handle) => clearTimeout(handle as never));
	}

	/** Returns `true` when an entry ran, so the caller can skip its own fallback handling. */
	handle(event: KeyboardEventLike, ctx: KeymapContext): boolean {
		const entries = this.getEntries();

		if (this.pendingPrefix !== null) {
			const prefix = this.pendingPrefix;
			this.clearPending();
			const continuation = entries.find(
				(entry) =>
					entry.keys.length === 2 &&
					chordsEqual(entry.keys[0], prefix) &&
					eventMatchesChord(event, entry.keys[1]) &&
					this.isEligible(entry, ctx)
			);
			if (continuation) {
				this.run(continuation, event, ctx);
				return true;
			}
			// Not a valid continuation: fall through and evaluate this keydown as
			// a fresh press (e.g. `g` then `?` should still open the overlay).
		}

		const direct = entries.find(
			(entry) =>
				entry.keys.length === 1 &&
				eventMatchesChord(event, entry.keys[0]) &&
				this.isEligible(entry, ctx)
		);
		if (direct) {
			this.run(direct, event, ctx);
			return true;
		}

		const startsSequence = entries.some(
			(entry) =>
				entry.keys.length === 2 &&
				eventMatchesChord(event, entry.keys[0]) &&
				this.isEligible(entry, ctx)
		);
		if (startsSequence) {
			this.pendingPrefix = normalizeKey(event.key);
			this.pendingTimer = this.scheduleTimeout(() => this.clearPending(), this.sequenceWindowMs);
		}

		return false;
	}

	/** Exposed for tests; harmless to call from real code too (e.g. on route change). */
	resetSequence(): void {
		this.clearPending();
	}

	private clearPending(): void {
		if (this.pendingTimer !== null) this.cancelTimeout(this.pendingTimer);
		this.pendingPrefix = null;
		this.pendingTimer = null;
	}

	private isEligible(entry: KeymapEntry, ctx: KeymapContext): boolean {
		if (ctx.overlayOpen && !entry.allowWhileOverlay) return false;
		if (ctx.typingTarget && !entry.allowWhileTyping) return false;
		if (entry.scope !== 'global' && entry.scope !== ctx.scope) return false;
		if (entry.permission) {
			const required = [entry.permission].flat();
			if (!required.some((permission) => ctx.permissions.includes(permission))) return false;
		}
		if (entry.when && !entry.when(ctx)) return false;
		return true;
	}

	private run(entry: KeymapEntry, event: KeyboardEventLike, ctx: KeymapContext): void {
		event.preventDefault?.();
		entry.run(ctx);
	}
}

/**
 * Focuses a panel's first field for a row verb's "jump and focus" landing
 * (#88: `a`/`e`/`l`/`s`). `#98` replaced native `<select>` with bits-ui's
 * combobox, whose focusable trigger is a `<button data-slot="select-trigger">`
 * — a plain `input, select, textarea` query misses it entirely.
 */
export interface FocusableQueryLike {
	querySelector(selectors: string): { focus(): void } | null;
}

export function focusFirstField(container: FocusableQueryLike | null | undefined): void {
	container?.querySelector('input, textarea, select, [data-slot="select-trigger"]')?.focus();
}

/** The registry every `AppShell` instance routes through. One per app, like the router. */
export const keymapRegistry = new KeymapRegistry();

/**
 * Which part of the screen currently owns keyboard focus, for `KeymapEntry.scope`.
 * `DataTable` sets `'list'` while focus is inside it and clears it on
 * `focusout`; a record detail layout would do the same with `'record'`. One
 * shared store rather than a prop drilled through every layout — scope is a
 * property of *where the browser's focus is*, not of any one component tree.
 */
export const activeScope = writable<KeymapScope>('global');
