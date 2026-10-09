import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * The `utils` alias in `components.json`: shadcn-svelte output imports `cn` and
 * `WithElementRef` from here, so this file is part of that contract rather than
 * a general-purpose helper bag.
 *
 * Our own components under `components/unitati/` use `tv()` from
 * tailwind-variants instead, which already merges classes.
 */

/** Joins conditional class names and lets the later Tailwind utility win. */
export function cn(...inputs: ClassValue[]): string {
	return twMerge(clsx(inputs));
}

/** Adds the `ref` prop every shadcn-svelte primitive binds its element to. */
export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & {
	ref?: U | null;
};

/**
 * Strips `children` and the render-prop `child`: a primitive that renders its
 * own markup around whatever is passed (shadcn-svelte's `sheet`, first vendored
 * for #83) takes the rest of its caller's props but supplies both of those
 * itself.
 */
export type WithoutChildrenOrChild<T> = Omit<T, 'children' | 'child'>;
