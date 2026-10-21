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

const ACTS: Record<'delivery' | 'return', string> = {
	delivery: 'entrega',
	return: 'devolución'
};

/**
 * The person's own copy of the document (ADR 0036, decision 3). Receiving it
 * at the moment of signing is evidence on its own, so it goes out whether they
 * accepted or rejected.
 */
export function handoverCopyMail(input: {
	personName: string;
	organisationName: string;
	code: string;
	direction: 'delivery' | 'return';
	status: 'accepted' | 'rejected';
}): { subject: string; text: string } {
	const act = ACTS[input.direction];
	const verb = input.status === 'accepted' ? 'aceptado' : 'rechazado';
	return {
		subject: `[${input.code}] ${input.organisationName}: tu copia del acta de ${act}`,
		text: [
			`Hola ${input.personName},`,
			'',
			`Has ${verb} el acta de ${act} ${input.code} de ${input.organisationName}. Te adjuntamos tu copia en PDF.`,
			'',
			'Guárdala: es el documento que recoge lo que firmaste, cuándo y desde dónde.'
		].join('\n')
	};
}

/** To the technician who issued a handover, when the person accepts it (#276). */
export function handoverAcceptedMail(input: {
	issuerName: string;
	personName: string;
	code: string;
	direction: 'delivery' | 'return';
}): { subject: string; text: string } {
	const act = ACTS[input.direction];
	return {
		subject: `[${input.code}] ${input.personName} ha firmado la ${act}`,
		text: [
			`Hola ${input.issuerName},`,
			'',
			`${input.personName} ha aceptado y firmado la ${act} ${input.code}. Te adjuntamos el acta en PDF.`
		].join('\n')
	};
}
