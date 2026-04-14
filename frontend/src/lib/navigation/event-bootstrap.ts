import type { PolyEvent } from '$lib/polymarket';

const STORAGE_PREFIX = 'polymock:eventStash:v1:';

/**
 * Persist the event payload before navigating to `/event/[slug]` so the detail
 * page can render the same object the user clicked (not only a slug lookup).
 */
export function stashEventForRoute(event: PolyEvent): void {
	if (typeof sessionStorage === 'undefined' || !event?.slug) return;
	try {
		const key = STORAGE_PREFIX + encodeURIComponent(event.slug);
		sessionStorage.setItem(key, JSON.stringify(event));
	} catch (e) {
		console.warn('stashEventForRoute failed', e);
	}
}

/** Consume and remove a stashed event for this slug (one-shot). */
export function takeStashedEventForSlug(slug: string): PolyEvent | null {
	if (typeof sessionStorage === 'undefined' || !slug) return null;
	try {
		const key = STORAGE_PREFIX + encodeURIComponent(slug);
		const raw = sessionStorage.getItem(key);
		if (!raw) return null;
		sessionStorage.removeItem(key);
		return JSON.parse(raw) as PolyEvent;
	} catch {
		return null;
	}
}
