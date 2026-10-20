/**
 * In-process domain events (ADR 0024): the one way a domain reacts to a fact
 * that happened in another without importing it.
 *
 * - **Emit after commit, never inside a transaction.** The owning domain's
 *   public function returns, or the transaction resolves, and only then emits. A
 *   handler can never observe uncommitted state and a rolled-back write never
 *   emits.
 * - **Handlers are isolated.** In the default `async` mode each one runs on its
 *   own microtask, is not awaited, and a throw or rejection is logged with the
 *   event and handler names; it touches neither the emitter nor the others.
 * - **No persistence, retries or ordering across events.** A crash between
 *   commit and dispatch loses the event, the same guarantee `sendQuietly` has.
 *
 * To add an event: declare its payload in `DomainEvents`, emit it from the one
 * function that owns the fact, and subscribe in `server/subscriptions.ts`.
 */
export interface DomainEvents {
	'task.completed': {
		organisationId: string;
		taskId: string;
		taskTag: string;
		taskTitle: string;
		fromStateName: string;
		toStateName: string;
		actorPersonId: string | null;
		occurredAt: Date;
	};
	/** A person accepted a handover through its signing link (ADR 0035). */
	'handover.accepted': {
		organisationId: string;
		handoverId: string;
		handoverCode: string;
		direction: 'delivery' | 'return';
		personId: string;
		personName: string;
		occurredAt: Date;
	};
	/** A person rejected a handover through its signing link, with their reason. */
	'handover.rejected': {
		organisationId: string;
		handoverId: string;
		handoverCode: string;
		direction: 'delivery' | 'return';
		personId: string;
		personName: string;
		reason: string;
		occurredAt: Date;
	};
}

export type EventName = keyof DomainEvents;
export type EventHandler<K extends EventName> = (event: DomainEvents[K]) => Promise<void> | void;

type DispatchMode = 'async' | 'sync';

// Typed per key at the `on`/`emit` boundary; the map itself is deliberately loose.
const subscriptions = new Map<EventName, Set<EventHandler<never>>>();

let mode: DispatchMode = 'async';
/** In `sync` mode, the tail of the chain `flushEvents()` waits for. */
let chain: Promise<void> = Promise.resolve();

/** Subscribes `handler`; registering the same function twice is a no-op. Returns the unsubscribe. */
export function on<K extends EventName>(name: K, handler: EventHandler<K>): () => void {
	let handlers = subscriptions.get(name);
	if (!handlers) subscriptions.set(name, (handlers = new Set()));
	handlers.add(handler as EventHandler<never>);

	return () => {
		handlers.delete(handler as EventHandler<never>);
	};
}

async function run<K extends EventName>(name: K, handler: EventHandler<K>, event: DomainEvents[K]) {
	try {
		await handler(event);
	} catch (error) {
		console.error(`event handler "${handler.name || 'anonymous'}" failed on "${name}"`, error);
	}
}

/** Fire-and-forget. Call it after commit; it returns before any handler has run. */
export function emit<K extends EventName>(name: K, event: DomainEvents[K]): void {
	const handlers = [...(subscriptions.get(name) ?? [])] as EventHandler<K>[];

	for (const handler of handlers) {
		if (mode === 'async') {
			queueMicrotask(() => void run(name, handler, event));
		} else {
			chain = chain.then(() => run(name, handler, event));
		}
	}
}

/** Tests only: resolves once every handler emitted so far in `sync` mode has finished. */
export async function flushEvents(): Promise<void> {
	await chain;
}

/** Tests only. */
export function resetSubscriptions(): void {
	subscriptions.clear();
	chain = Promise.resolve();
}

/** Tests only; the default is `async`. */
export function setDispatchMode(next: DispatchMode): void {
	mode = next;
}
