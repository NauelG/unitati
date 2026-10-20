import { describe, expect, it } from 'vitest';
import {
	getHandoverSettings,
	listCategories,
	listHandoverAgreements,
	listHandoverTemplateVersions,
	removeHandoverOverride,
	saveHandoverTemplate,
	setCategoryRequiresHandover,
	setHandoverLinkValidDays
} from '.';
import { createCatalogue, createOrganisation, createViewer } from './testing/fixtures';

/**
 * The settings behind the signed handover (ADR 0035, decisions 2 and 7): the
 * versioned agreement texts, the category flag and how long a link lives.
 */

async function workspace() {
	const organisation = await createOrganisation();
	const admin = await createViewer(organisation.id, 'admin', 'Grace Hopper');
	const employee = await createViewer(organisation.id, 'employee', 'Ada Lovelace');
	return { organisation, admin, employee };
}

describe('saving a template', () => {
	it('appends a version each time and never rewrites an earlier one', async () => {
		const { organisation, admin } = await workspace();

		const first = await saveHandoverTemplate(admin, {
			direction: 'delivery',
			categoryId: null,
			body: 'Texto uno'
		});
		const second = await saveHandoverTemplate(admin, {
			direction: 'delivery',
			categoryId: null,
			body: 'Texto dos'
		});

		expect(first).toMatchObject({ ok: true, value: { version: 1 } });
		expect(second).toMatchObject({ ok: true, value: { version: 2 } });
		if (!first.ok) throw new Error('unreachable');

		const versions = await listHandoverTemplateVersions(organisation.id, first.value.templateId);
		expect(versions.map((v) => [v.version, v.body, v.authorName])).toEqual([
			[2, 'Texto dos', 'Grace Hopper'],
			[1, 'Texto uno', 'Grace Hopper']
		]);
	});

	it('keeps one template per direction and category', async () => {
		const { organisation, admin } = await workspace();
		const { categoryId } = await createCatalogue(organisation.id);

		await saveHandoverTemplate(admin, { direction: 'delivery', categoryId: null, body: 'a' });
		await saveHandoverTemplate(admin, { direction: 'return', categoryId: null, body: 'b' });
		await saveHandoverTemplate(admin, { direction: 'delivery', categoryId, body: 'c' });
		await saveHandoverTemplate(admin, { direction: 'delivery', categoryId, body: 'd' });

		const agreements = await listHandoverAgreements(organisation.id);
		expect(agreements.map((a) => [a.direction, a.categoryName, a.latestVersion])).toEqual([
			['delivery', null, 1],
			['return', null, 1],
			['delivery', 'Laptops', 2]
		]);
	});

	it('refuses a blank body', async () => {
		const { admin } = await workspace();
		expect(
			await saveHandoverTemplate(admin, { direction: 'delivery', categoryId: null, body: '  ' })
		).toEqual({ ok: false, error: 'empty_body' });
	});

	it('refuses a category from another organisation', async () => {
		const { admin } = await workspace();
		const other = await createOrganisation('Other', 'other');
		const { categoryId } = await createCatalogue(other.id);

		expect(
			await saveHandoverTemplate(admin, { direction: 'delivery', categoryId, body: 'x' })
		).toEqual({ ok: false, error: 'category_not_found' });
	});

	it('is refused without assets.manage', async () => {
		const { employee } = await workspace();
		expect(
			await saveHandoverTemplate(employee, { direction: 'delivery', categoryId: null, body: 'x' })
		).toEqual({ ok: false, error: 'forbidden' });
	});
});

describe('removing an override', () => {
	it('removes the override and its versions', async () => {
		const { organisation, admin } = await workspace();
		const { categoryId } = await createCatalogue(organisation.id);
		const saved = await saveHandoverTemplate(admin, {
			direction: 'return',
			categoryId,
			body: 'x'
		});
		if (!saved.ok) throw new Error('unreachable');

		expect(await removeHandoverOverride(admin, saved.value.templateId)).toEqual({
			ok: true,
			value: undefined
		});
		expect(await listHandoverAgreements(organisation.id)).toEqual([]);
	});

	it('never removes a global template', async () => {
		const { admin } = await workspace();
		const saved = await saveHandoverTemplate(admin, {
			direction: 'return',
			categoryId: null,
			body: 'x'
		});
		if (!saved.ok) throw new Error('unreachable');

		expect(await removeHandoverOverride(admin, saved.value.templateId)).toEqual({
			ok: false,
			error: 'not_an_override'
		});
	});

	it('is refused without assets.manage', async () => {
		const { organisation, admin, employee } = await workspace();
		const { categoryId } = await createCatalogue(organisation.id);
		const saved = await saveHandoverTemplate(admin, {
			direction: 'return',
			categoryId,
			body: 'x'
		});
		if (!saved.ok) throw new Error('unreachable');

		expect(await removeHandoverOverride(employee, saved.value.templateId)).toEqual({
			ok: false,
			error: 'forbidden'
		});
	});
});

describe('the link validity', () => {
	it('defaults to 14 days when nothing was saved', async () => {
		const { organisation } = await workspace();
		expect(await getHandoverSettings(organisation.id)).toEqual({ linkValidDays: 14 });
	});

	it('persists and round-trips a value between 1 and 90', async () => {
		const { organisation, admin } = await workspace();

		expect(await setHandoverLinkValidDays(admin, 30)).toEqual({ ok: true, value: undefined });
		expect(await getHandoverSettings(organisation.id)).toEqual({ linkValidDays: 30 });
		expect(await setHandoverLinkValidDays(admin, 90)).toEqual({ ok: true, value: undefined });
		expect(await getHandoverSettings(organisation.id)).toEqual({ linkValidDays: 90 });
	});

	it.each([0, 91, 1.5, Number.NaN])('refuses %s', async (days) => {
		const { admin } = await workspace();
		expect(await setHandoverLinkValidDays(admin, days)).toEqual({
			ok: false,
			error: 'invalid_days'
		});
	});

	it('is refused without assets.manage', async () => {
		const { employee } = await workspace();
		expect(await setHandoverLinkValidDays(employee, 30)).toEqual({
			ok: false,
			error: 'forbidden'
		});
	});
});

describe('the requires-handover flag', () => {
	it('persists and shows in the category list', async () => {
		const { organisation, admin } = await workspace();
		const { categoryId } = await createCatalogue(organisation.id);

		expect((await listCategories(organisation.id))[0].requiresHandover).toBe(false);
		expect(await setCategoryRequiresHandover(admin, categoryId, true)).toEqual({
			ok: true,
			value: undefined
		});
		expect((await listCategories(organisation.id))[0].requiresHandover).toBe(true);
	});

	it("does not touch another organisation's category", async () => {
		const { admin } = await workspace();
		const other = await createOrganisation('Other', 'other');
		const { categoryId } = await createCatalogue(other.id);

		expect(await setCategoryRequiresHandover(admin, categoryId, true)).toEqual({
			ok: false,
			error: 'not_found'
		});
	});

	it('is refused without assets.manage', async () => {
		const { organisation, employee } = await workspace();
		const { categoryId } = await createCatalogue(organisation.id);

		expect(await setCategoryRequiresHandover(employee, categoryId, true)).toEqual({
			ok: false,
			error: 'forbidden'
		});
	});
});
