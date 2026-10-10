import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	afterViewTransitionSettles,
	prefersReducedMotion,
	registerViewTransitionSettle,
	toViewTransitionName
} from './motion.js';

describe('toViewTransitionName', () => {
	it('lowercases and keeps a simple tag intact', () => {
		expect(toViewTransitionName('record', 'AST-0231')).toBe('record-ast-0231');
	});

	it('folds whitespace and punctuation into single hyphens', () => {
		expect(toViewTransitionName('record', 'AST 0231 / rev.2')).toBe('record-ast-0231-rev-2');
	});

	it('strips leading and trailing separators produced by the fold', () => {
		expect(toViewTransitionName('record', '  TCK-1  ')).toBe('record-tck-1');
	});

	it('falls back to a placeholder rather than emitting an empty slug', () => {
		expect(toViewTransitionName('record', '***')).toBe('record-x');
	});

	it('keeps two different keys distinct', () => {
		const first = toViewTransitionName('record', 'AST-0231');
		const second = toViewTransitionName('record', 'AST-0232');
		expect(first).not.toBe(second);
	});
});

describe('prefersReducedMotion', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('is false outside a browser (no window)', () => {
		expect(prefersReducedMotion()).toBe(false);
	});

	it('reads window.matchMedia when present', () => {
		const matchMedia = vi.fn().mockReturnValue({ matches: true });
		vi.stubGlobal('window', { matchMedia });

		expect(prefersReducedMotion()).toBe(true);
		expect(matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
	});

	it('returns false when the query does not match', () => {
		vi.stubGlobal('window', { matchMedia: vi.fn().mockReturnValue({ matches: false }) });

		expect(prefersReducedMotion()).toBe(false);
	});
});

describe('afterViewTransitionSettles', () => {
	it('runs fn immediately when no transition is registered', async () => {
		const fn = vi.fn();

		await afterViewTransitionSettles(fn);

		expect(fn).toHaveBeenCalledOnce();
	});

	it('waits for the registered transition to finish before running fn', async () => {
		let resolveFinished!: () => void;
		const finished = new Promise<void>((resolve) => {
			resolveFinished = resolve;
		});
		registerViewTransitionSettle(finished);

		const fn = vi.fn();
		const settled = afterViewTransitionSettles(fn);

		// Not yet: the transition has not finished.
		await Promise.resolve();
		expect(fn).not.toHaveBeenCalled();

		resolveFinished();
		await settled;

		expect(fn).toHaveBeenCalledOnce();
	});

	it('still runs fn when the transition rejects (skipped/aborted)', async () => {
		let rejectFinished!: (reason: unknown) => void;
		const finished = new Promise((_, reject) => {
			rejectFinished = reject;
		});
		registerViewTransitionSettle(finished);
		rejectFinished(new Error('skipped'));

		const fn = vi.fn();
		await afterViewTransitionSettles(fn);

		expect(fn).toHaveBeenCalledOnce();
	});

	it('clears the registered transition once it settles, so the next call runs immediately', async () => {
		registerViewTransitionSettle(Promise.resolve());
		await afterViewTransitionSettles(() => {});

		const fn = vi.fn();
		await afterViewTransitionSettles(fn);

		expect(fn).toHaveBeenCalledOnce();
	});
});
