export class SettingsStore {
	minimap = $state(false);
	wordWrap = $state('on');
	lineNumbers = $state('on');
	themeScheme = $state<string>('github-dark');

	themes = [
		{ id: 'github-light', name: 'GitHub Light', mode: 'light' },
		{ id: 'github-dark', name: 'GitHub Dark', mode: 'dark' },
		{ id: 'vue', name: 'Vue', mode: 'light' },
		{ id: 'one-dark', name: 'One Dark', mode: 'dark' },
		{ id: 'monokai', name: 'Monokai', mode: 'dark' },
		{ id: 'nord', name: 'Nord', mode: 'dark' },
		{ id: 'solarized-dark', name: 'Solarized Dark', mode: 'dark' }
	];

	constructor() {
		if (typeof localStorage !== 'undefined') {
			const savedMinimap = localStorage.getItem('editor.minimap');
			const savedWordWrap = localStorage.getItem('editor.wordWrap');
			const savedLineNumbers = localStorage.getItem('editor.lineNumbers');
			const savedThemeScheme = localStorage.getItem('theme.scheme');

			if (savedMinimap !== null) this.minimap = savedMinimap === 'true';
			if (savedWordWrap !== null) this.wordWrap = savedWordWrap;
			if (savedLineNumbers !== null) this.lineNumbers = savedLineNumbers;
			if (savedThemeScheme !== null) this.themeScheme = savedThemeScheme;

			$effect.root(() => {
				$effect(() => {
					localStorage.setItem('editor.minimap', String(this.minimap));
					localStorage.setItem('editor.wordWrap', this.wordWrap);
					localStorage.setItem('editor.lineNumbers', this.lineNumbers);
					localStorage.setItem('theme.scheme', this.themeScheme);
					
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
	}

	setThemeScheme(scheme: string) {
		this.themeScheme = scheme;
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
