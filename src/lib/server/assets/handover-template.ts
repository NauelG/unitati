import { createHash } from 'node:crypto';

/**
 * The two pure rules of a handover template (ADR 0035, decision 7). Neither
 * touches the database: the caller loads the templates and the categories, so
 * the rules can be read and tested on their own.
 */

export type HandoverDirection = 'delivery' | 'return';

export interface TemplateRef {
	id: string;
	direction: HandoverDirection;
	/** `null` is the global template for the direction. */
	categoryId: string | null;
}

export interface CategoryRef {
	id: string;
	requiresHandover: boolean;
}

/**
 * The template a handover is signed against: the shared override when every
 * category that requires a handover has the same one, the global template
 * otherwise. `null` when the direction has no global template to fall back on.
 */
export function resolveHandoverTemplate<T extends TemplateRef>(
	templates: readonly T[],
	categories: readonly CategoryRef[],
	direction: HandoverDirection
): T | null {
	const ofDirection = templates.filter((template) => template.direction === direction);
	const global = ofDirection.find((template) => template.categoryId === null) ?? null;

	const requiring = [...new Set(categories.filter((c) => c.requiresHandover).map((c) => c.id))];
	// An override belongs to one category, so a shared override means one category.
	if (requiring.length === 1) {
		const override = ofDirection.find((template) => template.categoryId === requiring[0]);
		if (override) return override;
	}
	return global;
}

export interface RenderContext {
	personName: string;
	organisationName: string;
	/** Already formatted for the reader: the template does not choose a locale. */
	date: string;
}

export interface RenderedTemplate {
	text: string;
	sha256: string;
}

/**
 * The text the signer sees and the hash that proves it later. Substitution is a
 * single pass, so a person named `{{date}}` cannot expand into the date, and an
 * unknown placeholder stays visible instead of silently vanishing.
 */
export function renderHandoverTemplate(body: string, context: RenderContext): RenderedTemplate {
	const values: Record<string, string> = {
		'person.name': context.personName,
		'organisation.name': context.organisationName,
		date: context.date
	};
	const text = body.replace(/\{\{\s*([a-z.]+)\s*\}\}/g, (placeholder, key: string) =>
		Object.hasOwn(values, key) ? values[key] : placeholder
	);
	return { text, sha256: createHash('sha256').update(text, 'utf8').digest('hex') };
}
