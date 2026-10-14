import { describe, expect, it } from 'vitest';
import { m } from '#lib/paraglide/messages.js';
import { boardAriaStrings } from './board-aria.js';

/**
 * The library's English defaults, copied as literals from svelte-dnd-action's
 * documentation: the independent source of truth the board must never speak.
 */
const LIBRARY_ENGLISH = [
	'Started dragging item',
	'Moved item',
	'Stopped dragging item',
	'Tab to one the items',
	'This is a disabled drag and drop list'
];

const ctx = { itemLabel: 'OBR-1 Embalar', zoneLabel: 'En curso', position: 2, count: 3 };

describe('boardAriaStrings', () => {
	const strings = boardAriaStrings();
	const spoken: Record<string, string> = {
		dragStarted: strings.dragStarted!({ ...ctx, canMoveBetweenZones: true }),
		dragStartedAlone: strings.dragStarted!({ ...ctx, canMoveBetweenZones: false }),
		movedToPosition: strings.movedToPosition!(ctx),
		movedToZoneEnd: strings.movedToZoneEnd!(ctx),
		movedToZoneStart: strings.movedToZoneStart!(ctx),
		dropped: strings.dropped!(ctx),
		zoneActiveInstruction: (
			strings.zoneActiveInstruction as (ctx: { keyboardDragTrigger: 'space' }) => string
		)({ keyboardDragTrigger: 'space' }),
		zoneDragDisabledInstruction: strings.zoneDragDisabledInstruction!
	};

	it('speaks every string from a paraglide message key', () => {
		expect(spoken).toEqual({
			dragStarted: m.board_aria_drag_started(ctx),
			dragStartedAlone: m.board_aria_drag_started_single(ctx),
			movedToPosition: m.board_aria_moved_to_position(ctx),
			movedToZoneEnd: m.board_aria_moved_to_end(ctx),
			movedToZoneStart: m.board_aria_moved_to_start(ctx),
			dropped: m.board_aria_dropped(ctx),
			zoneActiveInstruction: m.board_aria_zone_active(),
			zoneDragDisabledInstruction: m.board_aria_zone_disabled()
		});
	});

	it('never speaks the library English default', () => {
		for (const [key, value] of Object.entries(spoken)) {
			for (const english of LIBRARY_ENGLISH) {
				expect(value, key).not.toContain(english);
			}
		}
	});

	it('overrides every string the library has, so none falls back to English', () => {
		expect(Object.keys(strings).sort()).toEqual([
			'dragStarted',
			'dropped',
			'movedToPosition',
			'movedToZoneEnd',
			'movedToZoneStart',
			'zoneActiveInstruction',
			'zoneDragDisabledInstruction'
		]);
	});
});
