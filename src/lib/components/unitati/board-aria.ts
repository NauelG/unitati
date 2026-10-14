import type { AriaStrings } from 'svelte-dnd-action';
import { m } from '#lib/paraglide/messages.js';

/**
 * What `svelte-dnd-action` says to a screen reader while a card is dragged
 * (#125). Every string is a paraglide message, resolved when the library asks
 * for it — not here — so the locale #36 adds is picked up without a reload.
 * The library merges these over its English defaults, so a key left out would
 * be spoken in English: the spec pins that all seven are overridden.
 */
export function boardAriaStrings(): AriaStrings {
	return {
		dragStarted: (ctx) =>
			ctx.canMoveBetweenZones
				? m.board_aria_drag_started(ctx)
				: m.board_aria_drag_started_single(ctx),
		movedToPosition: (ctx) => m.board_aria_moved_to_position(ctx),
		movedToZoneEnd: (ctx) => m.board_aria_moved_to_end(ctx),
		movedToZoneStart: (ctx) => m.board_aria_moved_to_start(ctx),
		dropped: (ctx) => m.board_aria_dropped(ctx),
		zoneActiveInstruction: () => m.board_aria_zone_active(),
		zoneDragDisabledInstruction: m.board_aria_zone_disabled()
	};
}
