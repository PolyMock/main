import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
	plugins: [
		nodePolyfills({
			include: ['process', 'buffer', 'util', 'stream', 'events', 'assert', 'string_decoder'],
			globals: {
				process: true,
				Buffer: true,
				global: true,
			},
			protocolImports: true,
			overrides: {
				fs: 'empty',
			},
		}),
		sveltekit(),
	],
});
