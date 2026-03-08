/**
 * Simple i18n (internationalization) utility
 * Supports Chinese and English
 */

export type Locale = 'zh' | 'en';

export interface Translations {
	// Common
	cancel: string;
	confirm: string;
	save: string;
	close: string;
	discard: string;

	// Export
	export: string;
	exportHtml: string;
	exportPdf: string;
	exportFormat: string;
	pdfSize: string;
	exportSuccess: string;
	exportFailed: string;
	dynamicSinglePage: string;

	// Print instructions
	printInstructionsWindows: string;
	printInstructionsMacos: string;
	printInstructionsLinux: string;
	printInstructionsDefault: string;

	// Title bar actions
	newFile: string;
	openFile: string;
	saveFile: string;
	saveAs: string;
	toggleToc: string;
	toggleSplitView: string;
	toggleRealtime: string;
	zoomIn: string;
	zoomOut: string;
	resetZoom: string;
	toggleMinimap: string;
	wordWrap: string;
	settings: string;

	// Modal
	dontSave: string;

	// Context menu
	copy: string;
	cut: string;
	paste: string;
	selectAll: string;
	reload: string;
	openInFolder: string;
	rename: string;
	closeTab: string;
	closeOtherTabs: string;
	closeTabsToRight: string;
	copyPath: string;

	// Uninstaller
	uninstallTitle: string;
	uninstallMessage: string;
	uninstallButton: string;
	uninstalling: string;
	uninstallComplete: string;
	uninstallFailed: string;
	removeUserData: string;
	removeFileAssociation: string;

	// Drag and drop
	dropToOpen: string;

	// File dialog
	unsavedChanges: string;
	saveChanges: string;
}

const translations: Record<Locale, Translations> = {
	zh: {
		// Common
		cancel: '取消',
		confirm: '确定',
		save: '保存',
		close: '关闭',
		discard: '放弃',

		// Export
		export: '导出',
		exportHtml: '导出 HTML',
		exportPdf: '导出 PDF',
		exportFormat: '导出格式',
		pdfSize: 'PDF 尺寸',
		exportSuccess: 'HTML 导出成功！',
		exportFailed: '导出失败',
		dynamicSinglePage: '单页（动态高度）',

		// Print instructions
		printInstructionsWindows: '在打印对话框中选择"Microsoft Print to PDF"或"Save as PDF"保存为PDF文件。',
		printInstructionsMacos: '在打印对话框中点击左下角"PDF"按钮，选择"存储为PDF"。',
		printInstructionsLinux: '在打印对话框中选择"Print to File"或"Save as PDF"保存为PDF文件。',
		printInstructionsDefault: '请在打印对话框中选择保存为PDF选项。',

		// Title bar actions
		newFile: '新建文件',
		openFile: '打开文件',
		saveFile: '保存文件',
		saveAs: '另存为',
		toggleToc: '切换目录',
		toggleSplitView: '切换分屏',
		toggleRealtime: '切换实时模式',
		zoomIn: '放大',
		zoomOut: '缩小',
		resetZoom: '重置缩放',
		toggleMinimap: '切换缩略图',
		wordWrap: '自动换行',
		settings: '设置',

		// Modal
		dontSave: '不保存',

		// Context menu
		copy: '复制',
		cut: '剪切',
		paste: '粘贴',
		selectAll: '全选',
		reload: '重新加载',
		openInFolder: '在文件夹中显示',
		rename: '重命名',
		closeTab: '关闭标签页',
		closeOtherTabs: '关闭其他标签页',
		closeTabsToRight: '关闭右侧标签页',
		copyPath: '复制路径',

		// Uninstaller
		uninstallTitle: '卸载 Markpad',
		uninstallMessage: '确定要卸载 Markpad 吗？',
		uninstallButton: '卸载',
		uninstalling: '正在卸载...',
		uninstallComplete: '卸载完成！',
		uninstallFailed: '卸载失败',
		removeUserData: '删除用户数据',
		removeFileAssociation: '删除文件关联',

		// Drag and drop
		dropToOpen: '拖放 Markdown 文件到此处打开',

		// File dialog
		unsavedChanges: '有未保存的更改',
		saveChanges: '是否保存更改？',
	},

	en: {
		// Common
		cancel: 'Cancel',
		confirm: 'Confirm',
		save: 'Save',
		close: 'Close',
		discard: 'Discard',

		// Export
		export: 'Export',
		exportHtml: 'Export HTML',
		exportPdf: 'Export PDF',
		exportFormat: 'Export Format',
		pdfSize: 'PDF Size',
		exportSuccess: 'HTML export successful!',
		exportFailed: 'Export failed',
		dynamicSinglePage: 'Single Page (Dynamic Height)',

		// Print instructions
		printInstructionsWindows: 'Select "Microsoft Print to PDF" or "Save as PDF" in the print dialog.',
		printInstructionsMacos: 'Click the "PDF" button in the bottom left corner and select "Save as PDF".',
		printInstructionsLinux: 'Select "Print to File" or "Save as PDF" in the print dialog.',
		printInstructionsDefault: 'Please select a PDF save option in the print dialog.',

		// Title bar actions
		newFile: 'New File',
		openFile: 'Open File',
		saveFile: 'Save File',
		saveAs: 'Save As',
		toggleToc: 'Toggle TOC',
		toggleSplitView: 'Toggle Split View',
		toggleRealtime: 'Toggle Realtime Mode',
		zoomIn: 'Zoom In',
		zoomOut: 'Zoom Out',
		resetZoom: 'Reset Zoom',
		toggleMinimap: 'Toggle Minimap',
		wordWrap: 'Word Wrap',
		settings: 'Settings',

		// Modal
		dontSave: "Don't Save",

		// Context menu
		copy: 'Copy',
		cut: 'Cut',
		paste: 'Paste',
		selectAll: 'Select All',
		reload: 'Reload',
		openInFolder: 'Open in Folder',
		rename: 'Rename',
		closeTab: 'Close Tab',
		closeOtherTabs: 'Close Other Tabs',
		closeTabsToRight: 'Close Tabs to Right',
		copyPath: 'Copy Path',

		// Uninstaller
		uninstallTitle: 'Uninstall Markpad',
		uninstallMessage: 'Are you sure you want to uninstall Markpad?',
		uninstallButton: 'Uninstall',
		uninstalling: 'Uninstalling...',
		uninstallComplete: 'Uninstall complete!',
		uninstallFailed: 'Uninstall failed',
		removeUserData: 'Remove User Data',
		removeFileAssociation: 'Remove File Association',

		// Drag and drop
		dropToOpen: 'Drop Markdown files here to open',

		// File dialog
		unsavedChanges: 'Unsaved Changes',
		saveChanges: 'Do you want to save changes?',
	},
};

/**
 * i18n class for managing translations
 */
class I18n {
	locale: Locale = 'zh';

	constructor() {
		// Defer locale detection to avoid SSR issues
		if (typeof window !== 'undefined') {
			this.detectLocale();
		}
	}

	private detectLocale(): void {
		// Check localStorage first
		try {
			const stored = localStorage.getItem('markpad-locale');
			if (stored === 'zh' || stored === 'en') {
				this.locale = stored;
				return;
			}
		} catch {
			// localStorage not available
		}

		// Detect from browser
		const browserLang = navigator.language.toLowerCase();
		if (browserLang.startsWith('zh')) {
			this.locale = 'zh';
		} else {
			this.locale = 'en';
		}
	}

	setLocale(locale: Locale): void {
		this.locale = locale;
		try {
			localStorage.setItem('markpad-locale', locale);
		} catch {
			// localStorage not available
		}
	}

	getLocale(): Locale {
		return this.locale;
	}

	t<K extends keyof Translations>(key: K): Translations[K] {
		return translations[this.locale][key];
	}

	/**
	 * Get all translations for current locale
	 */
	getAll(): Translations {
		return translations[this.locale];
	}

	/**
	 * Check if current locale is Chinese
	 */
	isZh(): boolean {
		return this.locale === 'zh';
	}
}

// Global i18n instance
export const i18n = new I18n();
