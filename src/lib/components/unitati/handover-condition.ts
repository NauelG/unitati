import type { HandoverCondition } from '#lib/domain/handover.js';
import { m } from '#lib/paraglide/messages.js';

/** The label of a returned asset's condition ("Bueno", "Dañado"), never its key. */
export function handoverConditionLabel(condition: HandoverCondition): string {
	const labels: Record<HandoverCondition, () => string> = {
		good: m.handover_condition_good,
		damaged: m.handover_condition_damaged,
		incomplete: m.handover_condition_incomplete
	};
	return labels[condition]();
}
