import { describe, expect, it } from 'vitest';
import { readTicketForm } from './form-data';

function post(build: (data: FormData) => void): Request {
	const data = new FormData();
	build(data);
	return new Request('http://localhost/', { method: 'POST', body: data });
}

describe('readTicketForm', () => {
	it('keeps every asset the form posted, not just the last', async () => {
		const request = post((data) => {
			data.append('assetIds', 'a');
			data.append('assetIds', 'b');
			data.append('subject', 'Impresora');
		});

		const { fields, assetIds } = await readTicketForm(request);

		expect({ assetIds, subject: fields.subject }).toEqual({
			assetIds: ['a', 'b'],
			subject: 'Impresora'
		});
	});

	it('gives an empty list when no asset was picked', async () => {
		const request = post((data) => data.append('subject', 'Impresora'));

		const { assetIds } = await readTicketForm(request);

		expect(assetIds).toEqual([]);
	});

	it('ignores blank entries a hidden input can leave behind', async () => {
		const request = post((data) => {
			data.append('assetIds', '');
			data.append('assetIds', 'a');
		});

		const { assetIds } = await readTicketForm(request);

		expect(assetIds).toEqual(['a']);
	});
});
