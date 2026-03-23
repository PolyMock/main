<script lang="ts">
	import { onMount } from 'svelte';
	import { EditorView, basicSetup } from 'codemirror';
	import { EditorState } from '@codemirror/state';
	import { python } from '@codemirror/lang-python';
	import { oneDark } from '@codemirror/theme-one-dark';

	interface Props {
		code?: string;
		readOnly?: boolean;
		onChange?: (code: string) => void;
		placeholder?: string;
	}

	let { code = '', readOnly = false, onChange, placeholder = '' }: Props = $props();

	let editorContainer: HTMLDivElement;
	let editor: EditorView | null = null;

	onMount(() => {
		if (!editorContainer) {
			console.error('[PythonCodeEditor] Container not found');
			return;
		}

		console.log('[PythonCodeEditor] Initializing editor...');

		try {
			const state = EditorState.create({
				doc: code,
				extensions: [
					basicSetup,
					python(),
					oneDark,
					EditorView.editable.of(!readOnly),
					EditorView.updateListener.of((update) => {
						if (update.docChanged && onChange) {
							onChange(update.state.doc.toString());
						}
					}),
				],
			});

			editor = new EditorView({
				state,
				parent: editorContainer,
			});

			console.log('[PythonCodeEditor] Editor initialized successfully');
		} catch (err) {
			console.error('[PythonCodeEditor] Failed to initialize editor:', err);
		}

		return () => {
			if (editor) {
				editor.destroy();
				editor = null;
			}
		};
	});
</script>

<div bind:this={editorContainer} class="editor-container"></div>

<style>
	.editor-container {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		position: relative;
	}

	:global(.editor-container .cm-editor) {
		height: 100% !important;
		flex: 1;
		font-family: 'Share Tech Mono', monospace;
		font-size: 13px;
		background: #0a0a0a;
	}

	:global(.editor-container .cm-scroller) {
		height: 100% !important;
		overflow-y: auto;
		overflow-x: auto;
	}

	:global(.editor-container .cm-gutters) {
		background-color: #0a0a0a;
		border-right: 1px solid #333;
	}

	:global(.editor-container .cm-linenumber) {
		color: #666;
		font-family: 'Share Tech Mono', monospace;
	}

	:global(.editor-container .cm-content) {
		padding: 12px 0;
		background-color: #0a0a0a;
		color: #e0e0e0;
		font-family: 'Share Tech Mono', monospace;
		caret-color: #f97316;
	}

	:global(.editor-container .cm-cursor) {
		border-left-color: #f97316 !important;
		border-left-width: 2px;
	}

	:global(.editor-container .cm-line) {
		background-color: transparent;
		color: #e0e0e0;
	}

	:global(.editor-container .cm-string) {
		color: #22c55e;
	}

	:global(.editor-container .cm-number) {
		color: #f97316;
	}

	:global(.editor-container .cm-atom) {
		color: #60a5fa;
	}

	:global(.editor-container .cm-keyword) {
		color: #a78bfa;
	}

	:global(.editor-container .cm-comment) {
		color: #666;
		font-style: italic;
	}

	:global(.editor-container .cm-variable) {
		color: #e0e0e0;
	}

	:global(.editor-container .cm-property) {
		color: #e0e0e0;
	}

	:global(.editor-container .cm-function) {
		color: #60a5fa;
	}

	:global(.editor-container .cm-operator) {
		color: #f97316;
	}

	:global(.editor-container .cm-selectionMatch) {
		background-color: rgba(249, 115, 22, 0.3);
	}

	:global(.editor-container .cm-selection) {
		background-color: rgba(249, 115, 22, 0.5);
	}
</style>
