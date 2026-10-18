import { createTV } from 'tailwind-variants';

/**
 * The type roles of `@theme inline` in `src/app.css` (`text-<role>`), each of
 * which sets size, line-height, tracking and weight at once.
 *
 * tailwind-merge does not know them: left alone it files `text-title-3` under
 * *text colour*, so `text-title-3 text-[var(--ink)]` collapses to the colour
 * and silently loses the whole role. Registering them as font sizes makes a
 * role conflict only with another role.
 */
export const TYPE_ROLES = [
	'display',
	'title-1',
	'title-2',
	'title-3',
	'body-lg',
	'body',
	'label',
	'small',
	'caption',
	'record-id',
	'mono'
] as const;

/** `tv()` that understands the type roles. Our components import this one. */
export const tv = createTV({
	twMergeConfig: {
		extend: {
			classGroups: {
				'font-size': [{ text: [...TYPE_ROLES] }]
			}
		}
	}
});
