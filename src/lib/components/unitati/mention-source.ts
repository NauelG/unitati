import type { MentionOption } from './mention-extension.js';

/**
 * Asks a mentions endpoint (#303) who the editor may offer. The server decides;
 * a failed request offers nobody rather than breaking the typing.
 */
export async function fetchMentions(
	url: string,
	params: Record<string, string>
): Promise<MentionOption[]> {
	try {
		const response = await fetch(`${url}?${new URLSearchParams(params)}`, {
			headers: { accept: 'application/json' }
		});
		if (!response.ok) return [];
		return (await response.json()) as MentionOption[];
	} catch {
		return [];
	}
}
