export class SettingsStore {
	minimap = $state(false);
	wordWrap = $state('on');
	lineNumbers = $state('on');
	
	// Our theme system
	themeScheme = $state<string>('github-dark');
	codeTheme = $state<string>('auto'); // 'auto' | 'dark-modern' | 'light-modern'
	
	toolbarLayout = $state<{ visible: string[]; hidden: string[] }>({
		visible: ['zoom', 'open_loc', 'split', 'sync', 'live', 'metadata', 'toc', 'vim_mode', 'zen_mode', 'theme_scheme', 'code_theme', 'edit'],
		hidden: ['full_width', 'settings']
	});

	themes = [
		{ id: 'github-light', name: 'GitHub Light', mode: 'light' },
		{ id: 'github-dark', name: 'GitHub Dark', mode: 'dark' },
		{ id: 'vue', name: 'Vue', mode: 'light' },
		{ id: 'one-dark', name: 'One Dark', mode: 'dark' },
		{ id: 'monokai', name: 'Monokai', mode: 'dark' },
		{ id: 'nord', name: 'Nord', mode: 'dark' },
		{ id: 'solarized-dark', name: 'Solarized Dark', mode: 'dark' }
	];
	
	codeThemes = [
		{ id: 'auto', name: '跟随全局主题' },
		{ id: 'dark-modern', name: 'VSCode Dark Modern' },
		{ id: 'light-modern', name: 'VSCode Light Modern' }
	];

	// Upstream features
	vimMode = $state(false);
	statusBar = $state(true);
	wordCount = $state(false);
	renderLineHighlight = $state('none');
	showTabs = $state(true);
	zenMode = $state(false);
	preZenState = $state<{
		renderLineHighlight: string;
		showTabs: boolean;
		statusBar: boolean;
		minimap: boolean;
		lineNumbers: string;
	} | null>(null);
	occurrencesHighlight = $state(false);

	editorFont = $state('Consolas');
	editorFontSize = $state(14);
	previewFont = $state('Segoe UI');
	previewFontSize = $state(16);
	codeFont = $state('Consolas');
	codeFontSize = $state(14);

	constructor() {
		if (typeof localStorage !== 'undefined') {
			const savedMinimap = localStorage.getItem('editor.minimap');
			const savedWordWrap = localStorage.getItem('editor.wordWrap');
			const savedLineNumbers = localStorage.getItem('editor.lineNumbers');
			const savedThemeScheme = localStorage.getItem('theme.scheme');
			const savedToolbarLayout = localStorage.getItem('ui.toolbarLayout');
			const savedCodeTheme = localStorage.getItem('code.theme');
			const savedVimMode = localStorage.getItem('editor.vimMode');
			const savedStatusBar = localStorage.getItem('editor.statusBar');

			const savedWordCount = localStorage.getItem('editor.wordCount');
			const savedRenderLineHighlight = localStorage.getItem('editor.renderLineHighlight');
			const savedShowTabs = localStorage.getItem('editor.showTabs');
			const savedZenMode = localStorage.getItem('editor.zenMode');
			const savedPreZenState = localStorage.getItem('editor.preZenState');
			const savedOccurrencesHighlight = localStorage.getItem('editor.occurrencesHighlight');

			const savedEditorFont = localStorage.getItem('editor.font');
			const savedEditorFontSize = localStorage.getItem('editor.fontSize');
			const savedPreviewFont = localStorage.getItem('preview.font');
			const savedPreviewFontSize = localStorage.getItem('preview.fontSize');
			const savedCodeFont = localStorage.getItem('preview.codeFont');
			const savedCodeFontSize = localStorage.getItem('preview.codeFontSize');
			const parseFontSize = (value: string | null, fallback: number, min: number, max: number) => {
				if (value === null) return fallback;
				const parsed = Number.parseInt(value, 10);
				if (!Number.isFinite(parsed)) return fallback;
				return Math.min(max, Math.max(min, parsed));
			};

			if (savedMinimap !== null) this.minimap = savedMinimap === 'true';
			if (savedWordWrap !== null) this.wordWrap = savedWordWrap;
			if (savedLineNumbers !== null) this.lineNumbers = savedLineNumbers;
			if (savedThemeScheme !== null) this.themeScheme = savedThemeScheme;
			if (savedCodeTheme !== null) this.codeTheme = savedCodeTheme;
			if (savedToolbarLayout !== null) {
				try {
					const parsed = JSON.parse(savedToolbarLayout);
					// Merge with defaults to ensure all IDs exist (in case of updates)
					const allIds = new Set([...this.toolbarLayout.visible, ...this.toolbarLayout.hidden]);
					const savedIds = new Set([...parsed.visible, ...parsed.hidden]);
					
					// Add any new IDs to visible
					allIds.forEach(id => {
						if (!savedIds.has(id)) parsed.visible.push(id);
					});
					
					this.toolbarLayout = parsed;
				} catch (e) { console.error('Failed to load toolbar layout', e); }
			}
			if (savedVimMode !== null) this.vimMode = savedVimMode === 'true';
			if (savedStatusBar !== null) this.statusBar = savedStatusBar === 'true';

			if (savedWordCount !== null) this.wordCount = savedWordCount === 'true';
			if (savedRenderLineHighlight !== null) this.renderLineHighlight = savedRenderLineHighlight;
			if (savedShowTabs !== null) this.showTabs = savedShowTabs === 'true';
			if (savedZenMode !== null) this.zenMode = savedZenMode === 'true';
			if (savedOccurrencesHighlight !== null) this.occurrencesHighlight = savedOccurrencesHighlight === 'true';
			if (savedPreZenState !== null) {
				try {
					this.preZenState = JSON.parse(savedPreZenState);
				} catch (e) {
					console.error('Failed to parse preZenState', e);
				}
			}

			if (savedEditorFont !== null) this.editorFont = savedEditorFont;
			this.editorFontSize = parseFontSize(savedEditorFontSize, this.editorFontSize, 10, 24);
			if (savedPreviewFont !== null) this.previewFont = savedPreviewFont;
			this.previewFontSize = parseFontSize(savedPreviewFontSize, this.previewFontSize, 12, 28);
			if (savedCodeFont !== null) this.codeFont = savedCodeFont;
			this.codeFontSize = parseFontSize(savedCodeFontSize, this.codeFontSize, 10, 24);

			$effect.root(() => {
				$effect(() => {
					localStorage.setItem('editor.minimap', String(this.minimap));
					localStorage.setItem('editor.wordWrap', this.wordWrap);
					localStorage.setItem('editor.lineNumbers', this.lineNumbers);
					localStorage.setItem('theme.scheme', this.themeScheme);
					localStorage.setItem('ui.toolbarLayout', JSON.stringify(this.toolbarLayout));
					localStorage.setItem('code.theme', this.codeTheme);
					
					// Apply theme to document
					this.applyTheme();
					
					localStorage.setItem('editor.vimMode', String(this.vimMode));
					localStorage.setItem('editor.statusBar', String(this.statusBar));

					localStorage.setItem('editor.wordCount', String(this.wordCount));
					localStorage.setItem('editor.renderLineHighlight', this.renderLineHighlight);
					localStorage.setItem('editor.showTabs', String(this.showTabs));
					localStorage.setItem('editor.zenMode', String(this.zenMode));
					localStorage.setItem('editor.occurrencesHighlight', String(this.occurrencesHighlight));
					localStorage.setItem('editor.font', this.editorFont);
					localStorage.setItem('editor.fontSize', String(this.editorFontSize));
					localStorage.setItem('preview.font', this.previewFont);
					localStorage.setItem('preview.fontSize', String(this.previewFontSize));
					localStorage.setItem('preview.codeFont', this.codeFont);
					localStorage.setItem('preview.codeFontSize', String(this.codeFontSize));
					if (this.preZenState) {
						localStorage.setItem('editor.preZenState', JSON.stringify(this.preZenState));
					} else {
						localStorage.removeItem('editor.preZenState');
					}
				});
			});
		}
	}

	applyTheme() {
		if (typeof document === 'undefined') return;
		const currentTheme = this.themes.find(t => t.id === this.themeScheme) || this.themes[1];
		
		document.documentElement.setAttribute('data-theme-mode', currentTheme.mode);
		document.documentElement.setAttribute('data-theme-scheme', this.themeScheme);
		
		// Apply code theme
		const effectiveCodeTheme = this.codeTheme === 'auto' 
			? (currentTheme.mode === 'dark' ? 'dark-modern' : 'light-modern')
			: this.codeTheme;
		document.documentElement.setAttribute('data-code-theme', effectiveCodeTheme);
	}

	setThemeScheme(scheme: string) {
		this.themeScheme = scheme;
	}
	
	setCodeTheme(theme: string) {
		this.codeTheme = theme;
	}

	moveToolbarAction(id: string, target: 'visible' | 'hidden') {
		// Remove from source
		this.toolbarLayout.visible = this.toolbarLayout.visible.filter(i => i !== id);
		this.toolbarLayout.hidden = this.toolbarLayout.hidden.filter(i => i !== id);
		
		// Add to target
		if (target === 'visible') {
			this.toolbarLayout.visible.push(id);
		} else {
			this.toolbarLayout.hidden.push(id);
		}
	}

	toggleMinimap() {
		this.minimap = !this.minimap;
	}

	toggleWordWrap() {
		this.wordWrap = this.wordWrap === 'on' ? 'off' : 'on';
	}

	toggleLineNumbers() {
		this.lineNumbers = this.lineNumbers === 'on' ? 'off' : 'on';
	}

	toggleVimMode() {
		this.vimMode = !this.vimMode;
	}

	toggleStatusBar() {
		this.statusBar = !this.statusBar;
	}

	toggleWordCount() {
		this.wordCount = !this.wordCount;
	}

	toggleLineHighlight() {
		this.renderLineHighlight = this.renderLineHighlight === 'line' ? 'none' : 'line';
	}

	toggleTabs() {
		this.showTabs = !this.showTabs;
	}

	toggleZenMode() {
		this.zenMode = !this.zenMode;
		if (this.zenMode) {
			this.preZenState = {
				renderLineHighlight: this.renderLineHighlight,
				showTabs: this.showTabs,
				statusBar: this.statusBar,
				minimap: this.minimap,
				lineNumbers: this.lineNumbers,
			};
			this.renderLineHighlight = 'none';
			this.showTabs = false;
			this.statusBar = false;
			this.minimap = false;
			this.lineNumbers = 'off';
		} else {
			if (this.preZenState) {
				this.renderLineHighlight = this.preZenState.renderLineHighlight;
				this.showTabs = this.preZenState.showTabs;
				this.statusBar = this.preZenState.statusBar;
				this.minimap = this.preZenState.minimap;
				this.lineNumbers = this.preZenState.lineNumbers;
				this.preZenState = null;
			}
		}
	}

	toggleOccurrencesHighlight() {
		this.occurrencesHighlight = !this.occurrencesHighlight;
	}
}

export const settings = new SettingsStore();