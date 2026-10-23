/**
 * Typography for rendered markdown (ADR 0030): paragraphs, lists, links, code
 * and quotes, written with design tokens. Shared by `TicketThread`, which shows
 * sanitised HTML, and `RichTextEditor`, which edits the same constructs, so what
 * you type looks like what you post.
 */
export const prose = [
	'text-body-lg break-words text-[var(--ink)]',
	'[&_p]:my-0 [&_p+p]:mt-[var(--space-2)] [&_li>p+p]:mt-0',
	'[&_ul]:my-[var(--space-2)] [&_ul]:list-disc [&_ul]:pl-[var(--space-5)]',
	'[&_ol]:my-[var(--space-2)] [&_ol]:list-decimal [&_ol]:pl-[var(--space-5)]',
	'[&_a]:text-[var(--brand)] [&_a]:underline [&_a]:underline-offset-2',
	'[&_code]:rounded-[var(--radius-sm)] [&_code]:bg-[var(--surface-2)] [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.9em]',
	'[&_pre]:my-[var(--space-2)] [&_pre]:overflow-x-auto [&_pre]:rounded-[var(--radius-md)] [&_pre]:bg-[var(--surface-2)] [&_pre]:p-[var(--space-3)]',
	'[&_pre_code]:bg-transparent [&_pre_code]:p-0',
	// The @mention chip (#303), in the editor and in rendered content alike.
	'[&_.mention]:rounded-[var(--radius-sm)] [&_.mention]:bg-[var(--brand-soft)] [&_.mention]:px-1 [&_.mention]:font-medium [&_.mention]:text-[var(--brand)]',
	'[&_blockquote]:my-[var(--space-2)] [&_blockquote]:border-l-2 [&_blockquote]:border-[var(--border-strong)] [&_blockquote]:pl-[var(--space-3)] [&_blockquote]:text-[var(--ink-muted)]',
	// The `document` profile (#324): headings, rules and tables. A comment never
	// contains them (the sanitiser drops them), so these only style pages.
	'[&_h2]:text-title-1 [&_h2]:mt-[var(--space-6)] [&_h2]:mb-[var(--space-2)] [&_h2]:scroll-mt-[var(--space-6)]',
	'[&_h3]:text-title-2 [&_h3]:mt-[var(--space-5)] [&_h3]:mb-[var(--space-2)] [&_h3]:scroll-mt-[var(--space-6)]',
	'[&_h4]:text-title-3 [&_h4]:mt-[var(--space-4)] [&_h4]:mb-[var(--space-1)] [&_h4]:scroll-mt-[var(--space-6)]',
	'[&>:first-child]:mt-0 [&_.ProseMirror>:first-child]:mt-0',
	'[&_hr]:my-[var(--space-5)] [&_hr]:border-0 [&_hr]:border-t [&_hr]:border-[var(--border)]',
	'[&_table]:my-[var(--space-3)] [&_table]:w-full [&_table]:border-collapse [&_table]:text-body',
	'[&_th]:border [&_th]:border-[var(--border)] [&_th]:bg-[var(--surface-2)] [&_th]:px-[var(--space-2)] [&_th]:py-[var(--space-1)] [&_th]:text-left [&_th]:font-semibold',
	'[&_td]:border [&_td]:border-[var(--border)] [&_td]:px-[var(--space-2)] [&_td]:py-[var(--space-1)] [&_td]:align-top',
	'[&_th_p]:my-0 [&_td_p]:my-0',
	// The cell the caret is in, while editing a table.
	'[&_.selectedCell]:bg-[var(--brand-soft)]'
];
