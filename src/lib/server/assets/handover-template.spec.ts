import { describe, expect, it } from 'vitest';
import { renderHandoverTemplate, resolveHandoverTemplate } from './handover-template';

/**
 * The two pure rules of a handover template (ADR 0035, decision 7): which
 * template applies to a set of categories, and what the signer is shown.
 */

const global = { id: 'global-delivery', direction: 'delivery', categoryId: null } as const;
const laptops = { id: 'laptops-delivery', direction: 'delivery', categoryId: 'laptops' } as const;
const phones = { id: 'phones-delivery', direction: 'delivery', categoryId: 'phones' } as const;
const globalReturn = { id: 'global-return', direction: 'return', categoryId: null } as const;
const templates = [global, laptops, phones, globalReturn];

const category = (id: string, requiresHandover = true) => ({ id, requiresHandover });

describe('resolving the template for a set of categories', () => {
	it('returns the override when the only requiring category has one', () => {
		expect(resolveHandoverTemplate(templates, [category('laptops')], 'delivery')).toBe(laptops);
	});

	it('returns the override when every asset shares the same requiring category', () => {
		const resolved = resolveHandoverTemplate(
			templates,
			[category('laptops'), category('laptops')],
			'delivery'
		);
		expect(resolved).toBe(laptops);
	});

	it('returns the global template for a mix of overrides', () => {
		const resolved = resolveHandoverTemplate(
			templates,
			[category('laptops'), category('phones')],
			'delivery'
		);
		expect(resolved).toBe(global);
	});

	it('returns the global template when one requiring category has no override', () => {
		const resolved = resolveHandoverTemplate(
			templates,
			[category('laptops'), category('monitors')],
			'delivery'
		);
		expect(resolved).toBe(global);
	});

	it('returns the global template when no category has an override', () => {
		expect(resolveHandoverTemplate(templates, [category('monitors')], 'delivery')).toBe(global);
	});

	it('ignores categories that do not require a handover', () => {
		const resolved = resolveHandoverTemplate(
			templates,
			[category('laptops'), category('phones', false)],
			'delivery'
		);
		expect(resolved).toBe(laptops);
	});

	it('only considers templates of the asked direction', () => {
		expect(resolveHandoverTemplate(templates, [category('laptops')], 'return')).toBe(globalReturn);
	});

	it('returns null when there is no global template for the direction', () => {
		expect(resolveHandoverTemplate([laptops], [category('monitors')], 'delivery')).toBeNull();
	});
});

describe('rendering a version', () => {
	const context = { personName: 'Ada Lovelace', organisationName: 'Acme', date: '20/10/2026' };

	it('substitutes the three placeholders', async () => {
		const rendered = renderHandoverTemplate(
			'{{person.name}} recibe equipos de {{organisation.name}} el {{date}}.',
			context
		);
		expect(rendered.text).toBe('Ada Lovelace recibe equipos de Acme el 20/10/2026.');
	});

	it('leaves unknown placeholders verbatim', () => {
		const rendered = renderHandoverTemplate('{{asset.list}} para {{person.name}}', context);
		expect(rendered.text).toBe('{{asset.list}} para Ada Lovelace');
	});

	it('returns the sha256 of the rendered text', () => {
		// echo -n 'hola' | sha256sum
		expect(renderHandoverTemplate('hola', context).sha256).toBe(
			'b221d9dbb083a7f33428d7c2a3c3198ae925614d70210e28716ccaa7cd4ddb79'
		);
	});

	it('changes the sha256 when one character of the output changes', () => {
		const first = renderHandoverTemplate('Hola {{person.name}}', context);
		const second = renderHandoverTemplate('Hola {{person.name}}', {
			...context,
			personName: 'Ada Lovelacf'
		});
		expect(second.sha256).not.toBe(first.sha256);
	});

	it('does not re-expand placeholders found inside a substituted value', () => {
		const rendered = renderHandoverTemplate('{{person.name}} {{date}}', {
			...context,
			personName: '{{date}}'
		});
		expect(rendered.text).toBe('{{date}} 20/10/2026');
	});
});
