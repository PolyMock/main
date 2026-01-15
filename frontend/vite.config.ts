import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
	plugins: [
		sveltekit(),
		nodePolyfills({
			include: ['process', 'buffer', 'util', 'stream', 'events'],
			globals: {
				process: true,
				Buffer: true,
			},
			protocolImports: true,
			overrides: {
				process: 'process/browser'
			}
		}),
	],
	define: {
		'process.env': {},
	},
	resolve: {
		alias: {
			process: 'process/browser'
		}
	}
});
