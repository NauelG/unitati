import type { HandoverDirection } from './handover-template';

/**
 * The text a new organisation starts with. Spanish on purpose: the organisation
 * writes the agreement in its own language and the product ships in Spanish
 * first. The list of assets is added by the system, not by this text.
 */
export const DEFAULT_HANDOVER_BODIES: Record<HandoverDirection, string> = {
	delivery: [
		'Yo, **{{person.name}}**, confirmo que el {{date}} he recibido de **{{organisation.name}}** los equipos detallados a continuación.',
		'',
		'Me comprometo a:',
		'',
		'- Usarlos únicamente para fines profesionales y con el cuidado debido.',
		'- No cederlos a terceros ni modificarlos sin autorización.',
		'- Comunicar de inmediato cualquier pérdida, robo o avería.',
		'- Devolverlos cuando la organización me lo solicite o al finalizar mi relación con ella.'
	].join('\n'),
	return: [
		'Yo, **{{person.name}}**, confirmo que el {{date}} he devuelto a **{{organisation.name}}** los equipos detallados a continuación.',
		'',
		'Declaro que los he entregado en el estado que consta en esta devolución y que no conservo copia de la información de la organización que contuvieran.'
	].join('\n')
};
