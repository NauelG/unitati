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
	'[&_blockquote]:my-[var(--space-2)] [&_blockquote]:border-l-2 [&_blockquote]:border-[var(--border-strong)] [&_blockquote]:pl-[var(--space-3)] [&_blockquote]:text-[var(--ink-muted)]'
];
