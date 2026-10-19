import type { QueueColor } from '#lib/domain/queue-color.js';
import { m } from '#lib/paraglide/messages.js';

/** The name a person hears for a swatch: the palette key is not display text. */
export function queueColorLabel(color: QueueColor): string {
	switch (color) {
		case 'gray':
			return m.queues_color_gray();
		case 'blue':
			return m.queues_color_blue();
		case 'violet':
			return m.queues_color_violet();
		case 'pink':
			return m.queues_color_pink();
		case 'red':
			return m.queues_color_red();
		case 'amber':
			return m.queues_color_amber();
		case 'green':
			return m.queues_color_green();
		case 'teal':
			return m.queues_color_teal();
	}
}
