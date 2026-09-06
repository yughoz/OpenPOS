// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { AuthUser } from '$lib/server/auth';

declare global {
	// di-inject Vite (define.__APP_VERSION__ dari package.json)
	const __APP_VERSION__: string;

	namespace App {
		// interface Error {}
		interface Locals {
			user: AuthUser | null;
			token: string | null;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
