/**
 * The mail that carries a signing link (ADR 0035, decision 4). Spanish, like the
 * other transactional mail; the agreement itself is in whatever language the
 * organisation wrote it.
 */
export function handoverLinkMail(input: {
	personName: string;
	organisationName: string;
	code: string;
	link: string;
	expiresOn: string;
}): { subject: string; text: string } {
	return {
		subject: `[${input.code}] ${input.organisationName}: confirma la recepción de tu equipo`,
		text: [
			`Hola ${input.personName},`,
			'',
			`${input.organisationName} te ha entregado equipo y necesita que lo confirmes con tu firma.`,
			'',
			input.link,
			'',
			`El enlace es personal, de un solo uso y caduca el ${input.expiresOn}.`
		].join('\n')
	};
}

/** To the technician who issued a handover, when the person rejects it (#275). */
export function handoverRejectedMail(input: {
	issuerName: string;
	personName: string;
	code: string;
	reason: string;
}): { subject: string; text: string } {
	return {
		subject: `[${input.code}] ${input.personName} ha rechazado la entrega`,
		text: [
			`Hola ${input.issuerName},`,
			'',
			`${input.personName} ha rechazado la entrega ${input.code} con este motivo:`,
			'',
			input.reason,
			'',
			'La custodia no ha cambiado. Para corregirla, recupera los equipos o emite una entrega nueva.'
		].join('\n')
	};
}
