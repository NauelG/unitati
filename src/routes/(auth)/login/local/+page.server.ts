import { passwordLogin, passwordLoginForm } from '../password';
import type { Actions, PageServerLoad } from './$types';

/**
 * Break-glass sign-in (ADR 0056): always reachable, never redirects, and no
 * setting can turn it off. While SSO is required it lets in admins only; that
 * rule is Better Auth's session creation, so this page needs no flag of its own.
 */
export const load: PageServerLoad = async ({ url }) => ({ form: await passwordLoginForm(url) });

export const actions: Actions = { default: passwordLogin };
