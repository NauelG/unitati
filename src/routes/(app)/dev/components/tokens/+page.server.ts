import { readFileSync } from 'node:fs';
import type { PageServerLoad } from './$types';

interface ColorToken {
	name: string;
	value: { light: string; dark: string };
	usage: string;
}

interface TypeStyle {
	name: string;
	fontSize: string;
	lineHeight: string;
	fontWeight: number;
	usage: string;
	sample: string;
	letterSpacing?: string;
}

interface TypeGroup {
	name: string;
	family: string;
	styles: TypeStyle[];
}

interface ScaleToken {
	name: string;
	value?: string;
	usage?: string;
}

interface Tokens {
	color: { tokens: ColorToken[] };
	type: { groups: TypeGroup[] };
	spacing: { tokens: ScaleToken[] };
	radius: { tokens: ScaleToken[] };
	shadow: { tokens: ScaleToken[] };
	size: { tokens: ScaleToken[] };
}

/**
 * Reads the canonical token file at render time (#85): the token page is a
 * rendering of `tokens.json`, not a second description of it, so a token
 * renamed or re-scoped there shows up here on the next request without
 * touching this file. The production 404 guard lives in the parent
 * `+layout.server.ts` (ADR 0011/0013) and already ran before this `load`.
 */
export const load: PageServerLoad = () => {
	const raw = readFileSync('docs/design/assets/tokens.json', 'utf8');
	const tokens = JSON.parse(raw) as Tokens;

	return {
		colorTokens: tokens.color.tokens,
		typeGroups: tokens.type.groups,
		spacingTokens: tokens.spacing.tokens,
		radiusTokens: tokens.radius.tokens,
		shadowTokens: tokens.shadow.tokens,
		sizeTokens: tokens.size.tokens
	};
};
