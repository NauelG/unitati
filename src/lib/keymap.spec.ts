import { describe, expect, it, vi } from 'vitest';
import {
	KeymapRegistry,
	KeymapRouter,
	focusFirstField,
	formatKeys,
	isMacPlatform,
	isOverlayOpen,
	isTypingTarget,
	type KeymapContext,
	type KeymapEntry
} from './keymap.js';

function ctx(overrides: Partial<KeymapContext> = {}): KeymapContext {
	return {
		scope: 'global',
		permissions: [],
		overlayOpen: false,
		typingTarget: false,
		...overrides
	};
}

function event(key: string, mods: Partial<{ metaKey: boolean; ctrlKey: boolean }> = {}) {
	return { key, preventDefault: vi.fn(), ...mods };
}

describe('isMacPlatform', () => {
	it('reads a macOS platform string', () => {
		expect(isMacPlatform({ platform: 'MacIntel', userAgent: '' })).toBe(true);
	});

	it('falls back to the user agent when platform is absent', () => {
		expect(isMacPlatform({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' })).toBe(
			true
		);
	});

	it('is false for Windows/Linux', () => {
		expect(isMacPlatform({ platform: 'Win32', userAgent: 'Windows NT 10.0' })).toBe(false);
	});

	it('is false with no navigator at all', () => {
		expect(isMacPlatform(undefined)).toBe(false);
	});
});

describe('isTypingTarget', () => {
	it('is true for an input', () => {
		expect(isTypingTarget({ tagName: 'INPUT' })).toBe(true);
	});

	it('is true for a textarea', () => {
		expect(isTypingTarget({ tagName: 'TEXTAREA' })).toBe(true);
	});

	it('is true for contentEditable', () => {
		expect(isTypingTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true);
	});

	it('is false for a plain element', () => {
		expect(isTypingTarget({ tagName: 'BUTTON' })).toBe(false);
	});

	it('is false for null', () => {
		expect(isTypingTarget(null)).toBe(false);
	});
});

describe('isOverlayOpen', () => {
	it('is true when an open overlay content element exists', () => {
		const host = { querySelector: () => ({}) };
		expect(isOverlayOpen(host)).toBe(true);
	});

	it('is false when nothing matches', () => {
		const host = { querySelector: () => null };
		expect(isOverlayOpen(host)).toBe(false);
	});

	it('is false without a host', () => {
		expect(isOverlayOpen(undefined)).toBe(false);
	});
});

describe('formatKeys', () => {
	it('glues the mod symbol to the key on macOS', () => {
		expect(formatKeys(['$mod+k'], true)).toBe('⌘K');
	});

	it('joins the mod word with + elsewhere', () => {
		expect(formatKeys(['$mod+k'], false)).toBe('Ctrl+K');
	});

	it('renders a g-prefix sequence as space-separated steps', () => {
		expect(formatKeys(['g', 'a'], true)).toBe('G A');
	});

	it('renders Escape as Esc', () => {
		expect(formatKeys(['Escape'], true)).toBe('Esc');
	});

	it('leaves punctuation keys alone', () => {
		expect(formatKeys(['?'], true)).toBe('?');
		expect(formatKeys(['/'], true)).toBe('/');
	});
});

describe('focusFirstField', () => {
	it('focuses the first matching field', () => {
		const focus = vi.fn();
		const container = { querySelector: () => ({ focus }) };
		focusFirstField(container);
		expect(focus).toHaveBeenCalledTimes(1);
	});

	it('does nothing without a match', () => {
		const container = { querySelector: () => null };
		expect(() => focusFirstField(container)).not.toThrow();
	});

	it('does nothing without a container', () => {
		expect(() => focusFirstField(null)).not.toThrow();
		expect(() => focusFirstField(undefined)).not.toThrow();
	});
});

describe('KeymapRegistry', () => {
	function entry(id: string): KeymapEntry {
		return { id, keys: ['a'], scope: 'global', group: 'Test', label: id, run: vi.fn() };
	}

	it('starts empty', () => {
		expect(new KeymapRegistry().snapshot()).toEqual([]);
	});

	it('register adds the entry and returns an unregister function', () => {
		const registry = new KeymapRegistry();
		const unregister = registry.register(entry('a'));
		expect(registry.snapshot().map((e) => e.id)).toEqual(['a']);
		unregister();
		expect(registry.snapshot()).toEqual([]);
	});

	it('registering the same id again replaces the entry', () => {
		const registry = new KeymapRegistry();
		registry.register(entry('a'));
		registry.register({ ...entry('a'), label: 'replaced' });
		expect(registry.snapshot()).toHaveLength(1);
		expect(registry.snapshot()[0].label).toBe('replaced');
	});

	it('the list store reflects the current snapshot', () => {
		const registry = new KeymapRegistry();
		let latest: KeymapEntry[] = [];
		registry.list.subscribe((value) => (latest = value));
		registry.register(entry('a'));
		expect(latest.map((e) => e.id)).toEqual(['a']);
	});
});

describe('KeymapRouter', () => {
	it('runs a matching single-chord entry and calls preventDefault', () => {
		const run = vi.fn();
		const router = new KeymapRouter(() => [
			{ id: 'a', keys: ['a'], scope: 'global', group: 'Test', label: 'a', run }
		]);
		const evt = event('a');
		const handled = router.handle(evt, ctx());
		expect(handled).toBe(true);
		expect(run).toHaveBeenCalledTimes(1);
		expect(evt.preventDefault).toHaveBeenCalledTimes(1);
	});

	it('does not match a different key', () => {
		const run = vi.fn();
		const router = new KeymapRouter(() => [
			{ id: 'a', keys: ['a'], scope: 'global', group: 'Test', label: 'a', run }
		]);
		expect(router.handle(event('b'), ctx())).toBe(false);
		expect(run).not.toHaveBeenCalled();
	});

	it('requires the $mod modifier to be held for a $mod chord', () => {
		const run = vi.fn();
		const router = new KeymapRouter(() => [
			{ id: 'palette', keys: ['$mod+k'], scope: 'global', group: 'Test', label: 'k', run }
		]);
		expect(router.handle(event('k'), ctx())).toBe(false);
		expect(router.handle(event('k', { metaKey: true }), ctx())).toBe(true);
		expect(run).toHaveBeenCalledTimes(1);
	});

	describe('scope filtering', () => {
		const entries: KeymapEntry[] = [
			{ id: 'global', keys: ['n'], scope: 'global', group: 'Test', label: 'n', run: vi.fn() },
			{ id: 'list', keys: ['a'], scope: 'list', group: 'Test', label: 'a', run: vi.fn() }
		];

		it('a global entry runs regardless of the active scope', () => {
			const router = new KeymapRouter(() => entries);
			expect(router.handle(event('n'), ctx({ scope: 'record' }))).toBe(true);
		});

		it('a list-scoped entry is ignored outside the list scope', () => {
			const router = new KeymapRouter(() => entries);
			expect(router.handle(event('a'), ctx({ scope: 'global' }))).toBe(false);
		});

		it('a list-scoped entry runs while the list scope is active', () => {
			const router = new KeymapRouter(() => entries);
			expect(router.handle(event('a'), ctx({ scope: 'list' }))).toBe(true);
		});
	});

	describe('permission filtering', () => {
		function entries(run: () => void): KeymapEntry[] {
			return [
				{
					id: 'manage',
					keys: ['e'],
					scope: 'global',
					group: 'Test',
					label: 'e',
					permission: 'assets.manage',
					run
				}
			];
		}

		it('is ignored when the viewer lacks the permission', () => {
			const run = vi.fn();
			const router = new KeymapRouter(() => entries(run));
			expect(router.handle(event('e'), ctx({ permissions: ['assets.view'] }))).toBe(false);
			expect(run).not.toHaveBeenCalled();
		});

		it('runs when the viewer holds the permission', () => {
			const run = vi.fn();
			const router = new KeymapRouter(() => entries(run));
			expect(router.handle(event('e'), ctx({ permissions: ['assets.manage'] }))).toBe(true);
		});

		it('accepts any one of several permissions', () => {
			const run = vi.fn();
			const entry: KeymapEntry = {
				id: 'either',
				keys: ['e'],
				scope: 'global',
				group: 'Test',
				label: 'e',
				permission: ['assets.manage', 'tickets.manage'],
				run
			};
			const router = new KeymapRouter(() => [entry]);
			expect(router.handle(event('e'), ctx({ permissions: ['tickets.manage'] }))).toBe(true);
		});
	});

	describe('input guard', () => {
		function makeEntries(run: () => void, allowWhileTyping = false): KeymapEntry[] {
			return [
				{
					id: 'n',
					keys: ['n'],
					scope: 'global',
					group: 'Test',
					label: 'n',
					allowWhileTyping,
					run
				}
			];
		}

		it('blocks a plain shortcut while the target is typing', () => {
			const run = vi.fn();
			const router = new KeymapRouter(() => makeEntries(run));
			expect(router.handle(event('n'), ctx({ typingTarget: true }))).toBe(false);
			expect(run).not.toHaveBeenCalled();
		});

		it('allows a shortcut explicitly marked allowWhileTyping', () => {
			const run = vi.fn();
			const router = new KeymapRouter(() => makeEntries(run, true));
			expect(router.handle(event('n'), ctx({ typingTarget: true }))).toBe(true);
		});
	});

	describe('overlay guard', () => {
		function makeEntries(run: () => void, allowWhileOverlay = false): KeymapEntry[] {
			return [
				{
					id: 'n',
					keys: ['n'],
					scope: 'global',
					group: 'Test',
					label: 'n',
					allowWhileOverlay,
					run
				}
			];
		}

		it('blocks a plain shortcut while an overlay is open', () => {
			const run = vi.fn();
			const router = new KeymapRouter(() => makeEntries(run));
			expect(router.handle(event('n'), ctx({ overlayOpen: true }))).toBe(false);
			expect(run).not.toHaveBeenCalled();
		});

		it('allows a shortcut explicitly marked allowWhileOverlay', () => {
			const run = vi.fn();
			const router = new KeymapRouter(() => makeEntries(run, true));
			expect(router.handle(event('n'), ctx({ overlayOpen: true }))).toBe(true);
		});
	});

	describe('when predicate', () => {
		it('is consulted after every other guard passes', () => {
			const run = vi.fn();
			const entry: KeymapEntry = {
				id: 'row',
				keys: ['a'],
				scope: 'global',
				group: 'Test',
				label: 'a',
				when: () => false,
				run
			};
			const router = new KeymapRouter(() => [entry]);
			expect(router.handle(event('a'), ctx())).toBe(false);
			expect(run).not.toHaveBeenCalled();
		});
	});

	describe('g-prefix sequences', () => {
		function sequenceEntries(run: () => void): KeymapEntry[] {
			return [{ id: 'g-a', keys: ['g', 'a'], scope: 'global', group: 'Nav', label: 'g a', run }];
		}

		it('runs the sequence when the second key arrives within the window', () => {
			const run = vi.fn();
			const router = new KeymapRouter(() => sequenceEntries(run));
			expect(router.handle(event('g'), ctx())).toBe(false);
			expect(router.handle(event('a'), ctx())).toBe(true);
			expect(run).toHaveBeenCalledTimes(1);
		});

		it('a single unmatched key does not start a sequence it has no prefix for', () => {
			const run = vi.fn();
			const router = new KeymapRouter(() => sequenceEntries(run));
			expect(router.handle(event('z'), ctx())).toBe(false);
			expect(router.handle(event('a'), ctx())).toBe(false);
			expect(run).not.toHaveBeenCalled();
		});

		it('expires the prefix after the sequence window', () => {
			vi.useFakeTimers();
			try {
				const run = vi.fn();
				const router = new KeymapRouter(() => sequenceEntries(run), { sequenceWindowMs: 500 });
				expect(router.handle(event('g'), ctx())).toBe(false);
				vi.advanceTimersByTime(600);
				expect(router.handle(event('a'), ctx())).toBe(false);
				expect(run).not.toHaveBeenCalled();
			} finally {
				vi.useRealTimers();
			}
		});

		it('a non-continuation key after the prefix is still evaluated as a fresh press', () => {
			const run = vi.fn();
			const directRun = vi.fn();
			const entries: KeymapEntry[] = [
				...sequenceEntries(run),
				{
					id: 'escape',
					keys: ['Escape'],
					scope: 'global',
					group: 'Nav',
					label: 'esc',
					run: directRun
				}
			];
			const router = new KeymapRouter(() => entries);
			expect(router.handle(event('g'), ctx())).toBe(false);
			expect(router.handle(event('Escape'), ctx())).toBe(true);
			expect(directRun).toHaveBeenCalledTimes(1);
			expect(run).not.toHaveBeenCalled();
		});
	});
});
