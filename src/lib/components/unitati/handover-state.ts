import type { HandoverState } from '#lib/domain/handover.js';
import type { HandoverDirection } from '#lib/server/assets/index.js';
import { m } from '#lib/paraglide/messages.js';
import type { Tone } from './status.js';

/**
 * How each derived handover state reads (ADR 0035, decision 3). The state itself
 * is computed in the domain (`deriveHandoverState`); this is only its tone and
 * its words, so no component decides what "expired" means.
 */
const TONES: Record<HandoverState, Tone> = {
	pending: 'warning',
	expired: 'danger',
	accepted: 'success',
	rejected: 'danger',
	waived: 'neutral'
};

const LABELS: Record<HandoverState, () => string> = {
	pending: m.handover_state_pending,
	expired: m.handover_state_expired,
	accepted: m.handover_state_accepted,
	rejected: m.handover_state_rejected,
	waived: m.handover_state_waived
};

export function handoverStateBadge(state: HandoverState): { tone: Tone; label: string } {
	return { tone: TONES[state], label: LABELS[state]() };
}

export function handoverDirectionLabel(direction: HandoverDirection): string {
	return direction === 'delivery' ? m.handover_direction_delivery() : m.handover_direction_return();
}
