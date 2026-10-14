import { describe, expect, it } from 'vitest';
import {
	groupContainsPath,
	isNavGroup,
	navLeaves,
	resolveNavigation,
	type AppShellNavGroup,
	type AppShellNavLeaf,
	type AppShellNavLink
} from './app-shell-nav.js';

// The icon is opaque to the resolver; a stand-in keeps the spec free of Svelte.
const icon = (() => null) as unknown as AppShellNavLeaf['icon'];

const leaf = (href: string, extra: Partial<AppShellNavLeaf> = {}): AppShellNavLeaf => ({
	href,
	label: href,
	icon,
	...extra
});

const group = (
	id: string,
	children: AppShellNavLeaf[],
	extra: Partial<AppShellNavGroup> = {}
): AppShellNavGroup => ({
	id,
	label: `${id} group`,
	icon,
	section: 'modules',
	accent: 'var(--project)',
	children,
	...extra
});

describe('resolveNavigation', () => {
	it('keeps a leaf with no permission', () => {
		const links: AppShellNavLink[] = [leaf('/')];

		expect(resolveNavigation(links, [])).toEqual([{ kind: 'leaf', ...leaf('/') }]);
	});

	it('drops a leaf whose permission the viewer lacks, keeps it when any listed one is held', () => {
		const links: AppShellNavLink[] = [
			leaf('/a', { permission: 'a.view' }),
			leaf('/b', { permission: ['b.view', 'b.admin'] }),
			leaf('/c', { permission: 'c.view' })
		];

		const hrefs = resolveNavigation(links, ['b.admin', 'c.view']).map((item) =>
			item.kind === 'leaf' ? item.href : item.id
		);

		expect(hrefs).toEqual(['/b', '/c']);
	});

	it('drops hidden children and keeps the group while two remain visible', () => {
		const links: AppShellNavLink[] = [
			group('projects', [
				leaf('/projects', { permission: 'projects.view', count: 3 }),
				leaf('/tasks', { permission: 'tasks.view', count: 9 }),
				leaf('/boards', { permission: 'boards.view' })
			])
		];

		const [resolved] = resolveNavigation(links, ['projects.view', 'tasks.view']);

		expect(resolved).toMatchObject({ kind: 'group', id: 'projects' });
		expect(resolved.kind === 'group' && resolved.children.map((c) => c.href)).toEqual([
			'/projects',
			'/tasks'
		]);
	});

	it('keeps each child’s own count', () => {
		const links: AppShellNavLink[] = [
			group('projects', [leaf('/projects', { count: 3 }), leaf('/tasks', { count: 9 })])
		];

		const [resolved] = resolveNavigation(links, []);

		expect(resolved.kind === 'group' && resolved.children.map((c) => c.count)).toEqual([3, 9]);
	});

	it('removes a group whose children are all hidden', () => {
		const links: AppShellNavLink[] = [
			group('projects', [
				leaf('/projects', { permission: 'projects.view' }),
				leaf('/tasks', { permission: 'tasks.view' })
			])
		];

		expect(resolveNavigation(links, [])).toEqual([]);
	});

	it('flattens a group with exactly one visible child into a leaf', () => {
		const links: AppShellNavLink[] = [
			group(
				'assets',
				[
					leaf('/assets', { label: 'Inventario', count: 128 }),
					leaf('/tasks', { permission: 'tasks.view', count: 9 })
				],
				{ label: 'Activos', accent: 'var(--asset)' }
			)
		];

		const [resolved] = resolveNavigation(links, []);

		expect(resolved).toEqual({
			kind: 'leaf',
			href: '/assets',
			label: 'Activos',
			icon,
			section: 'modules',
			accent: 'var(--asset)',
			count: 128
		});
	});

	it('flattens a one-child group without a count to a leaf without a count', () => {
		const [resolved] = resolveNavigation([group('projects', [leaf('/projects')])], []);

		expect(resolved.kind).toBe('leaf');
		expect(resolved).not.toHaveProperty('count');
	});

	it('preserves order across leaves and groups', () => {
		const links: AppShellNavLink[] = [
			leaf('/'),
			group('work', [leaf('/projects'), leaf('/tasks')]),
			leaf('/directory')
		];

		const order = resolveNavigation(links, []).map((item) =>
			item.kind === 'leaf' ? item.href : item.id
		);

		expect(order).toEqual(['/', 'work', '/directory']);
	});
});

describe('navLeaves', () => {
	it('lists every reachable href: leaves, group children and flattened groups', () => {
		const resolved = resolveNavigation(
			[
				leaf('/'),
				group('work', [leaf('/projects'), leaf('/tasks')]),
				group('assets', [leaf('/assets')])
			],
			[]
		);

		expect(navLeaves(resolved).map((entry) => entry.href)).toEqual([
			'/',
			'/projects',
			'/tasks',
			'/assets'
		]);
	});
});

describe('groupContainsPath', () => {
	const work = group('work', [leaf('/projects'), leaf('/tasks')]);

	it('is true when the path is inside a child', () => {
		expect(groupContainsPath(work.children, '/tasks/42')).toBe(true);
	});

	it('is false for an unrelated path', () => {
		expect(groupContainsPath(work.children, '/directory')).toBe(false);
	});

	it('does not match a sibling that merely shares a prefix', () => {
		expect(groupContainsPath([leaf('/task')], '/tasks')).toBe(false);
	});
});

describe('isNavGroup', () => {
	it('tells a group from a leaf', () => {
		expect(isNavGroup(group('g', [leaf('/x')]))).toBe(true);
		expect(isNavGroup(leaf('/x'))).toBe(false);
	});
});
