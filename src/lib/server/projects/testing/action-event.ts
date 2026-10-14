import type { SessionUser } from '#lib/server/auth/guards.js';

/** A SvelteKit action event, as far as the projects and tasks actions read one. */
export function actionEvent(
	user: SessionUser | null,
	fields: Record<string, string | string[]> = {},
	params: Record<string, string> = {}
) {
	const data = new FormData();
	for (const [key, value] of Object.entries(fields)) {
		for (const item of [value].flat()) data.append(key, item);
	}
	return {
		request: new Request('http://localhost/action', { method: 'POST', body: data }),
		locals: { user },
		params
	} as never;
}

/** Runs an action and returns whatever it threw (`error()`/`redirect()`) or returned. */
export async function outcomeOf(run: () => unknown): Promise<{
	thrown?: { status: number; location?: string };
	returned?: { status: number; data: Record<string, unknown> };
}> {
	try {
		return { returned: (await run()) as never };
	} catch (caught) {
		return { thrown: caught as { status: number; location?: string } };
	}
}
