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
