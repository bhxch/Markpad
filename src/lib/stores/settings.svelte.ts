export class SettingsStore {
	minimap = $state(false);
	wordWrap = $state('on');
	lineNumbers = $state('on');
	themeScheme = $state<string>('github-dark');
	codeTheme = $state<string>('auto'); // 'auto' | 'dark-modern' | 'light-modern'
	
	toolbarLayout = $state<{ visible: string[]; hidden: string[] }>({
		visible: ['zoom', 'open_loc', 'split', 'sync', 'live', 'metadata', 'toc', 'theme_scheme', 'code_theme', 'edit'],
		hidden: []
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

	constructor() {
		if (typeof localStorage !== 'undefined') {
			const savedMinimap = localStorage.getItem('editor.minimap');
			const savedWordWrap = localStorage.getItem('editor.wordWrap');
			const savedLineNumbers = localStorage.getItem('editor.lineNumbers');
			const savedThemeScheme = localStorage.getItem('theme.scheme');
			const savedToolbarLayout = localStorage.getItem('ui.toolbarLayout');
			const savedCodeTheme = localStorage.getItem('code.theme');

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
}

export const settings = new SettingsStore();
