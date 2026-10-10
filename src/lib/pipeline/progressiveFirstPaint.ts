// D34（spec 2026-10-10-progressive-first-paint-design）：渐进式首屏渲染。
// 大文档一次性 replaceChildren 的成本在 style+layout（真机冻结 852ms，CPU 采样
// 100% 在 WebProcess）。本模块把 sanitized 树分解为"壳 + 块"前序附加单元：
// head 首屏切片走既有同步 patch，剩余单元由 drain 按帧预算（默认 24ms，量在
// 每次 host.offsetHeight 强制布局上）以克隆逐帧落地；排空后由调用方对完整
// sanitized fragment 再跑一次 patchPreviewBlocks——克隆键（outerHTML 去
// sourcepos）与源逐字节一致，diff 零替换、memo 对齐全量键，首个 keystroke
// 仍是增量 patch。
// DESCEND 选择器复制自上游 blockPatch.ts 的 DESCENDABLE 契约（防漂移由
// upstreamWiring.test.ts 的提取比对钉住）；上游若改该清单须同步此处，否则
// 退化为"更大的附加单元"（仍正确，只是首屏后的帧更大）。

const WRAPPER_SELECTOR = '.foldable-content-wrapper';
const CONTENT_INNER_SELECTOR = ':scope > .content-inner';
// 与 blockPatch.ts DESCENDABLE 保持同源（除 content-inner 外的容器按整块附加，安全退化）
const SHELL_WRAP_SELECTOR = '.markdown-alert, .markdown-alert-content';

export interface ProgressiveUnit {
	node: Element;
	parentPath: number[];
}

export interface DrainOptions {
	budgetMs?: number;
	schedule?: (cb: () => void) => void;
	onBatch?: (inserted: Element[]) => void;
}

export interface ProgressiveRender {
	head: DocumentFragment;
	units: ProgressiveUnit[];
	unitCount: number;
	drain(host: HTMLElement, opts?: DrainOptions): Promise<void>;
}

export interface PlanOptions {
	headUnits?: number;
	threshold?: number;
}

function isFoldWrapper(el: Element): boolean {
	return el instanceof Element && el.matches(WRAPPER_SELECTOR);
}

/** wrapper 的壳克隆：本体+头部等非 content-inner 子级整克隆，content-inner 留空 */
function cloneWrapperShell(wrapper: Element): Element {
	const shell = wrapper.cloneNode(false) as Element;
	for (const child of [...wrapper.children]) {
		// D34 修正：这里须按类名判直接子级（brief 原稿 `matches(':scope > …')`
		// 在 matches() 语义下恒 false，壳退化为全量克隆）。ci 是 wrapper 唯一的
		// 直接 .content-inner 子级（processMarkdownHtml 的装配契约）。
		if (child.matches('.content-inner')) {
			shell.append(child.cloneNode(false));
		} else {
			shell.append(child.cloneNode(true));
		}
	}
	return shell;
}

interface PlanTree {
	units: ProgressiveUnit[];
	unitCount: number;
}

function walk(parent: ParentNode, parentPath: number[], units: ProgressiveUnit[], counter: { n: number }): void {
	for (let i = 0; i < parent.children.length; i++) {
		const child = parent.children[i];
		const childPath = [...parentPath, i];
		if (isFoldWrapper(child)) {
			units.push({ node: child, parentPath });
			counter.n++;
			const inner = child.querySelector(CONTENT_INNER_SELECTOR);
			if (inner) {
				// D34 修正：ci 的子索引取其真实位置（brief 原稿的
				// `c.matches(':scope > …')` 在 matches() 语义下恒 false 得 -1），
				// 壳克隆按原子索引留空占位，嵌套单元的 parentPath 据此解析。
				walk(inner, [...childPath, [...child.children].indexOf(inner)], units, counter);
			}
		} else if (child.matches(SHELL_WRAP_SELECTOR)) {
			// 告警容器按整块附加（安全退化：不深入）
			units.push({ node: child, parentPath });
			counter.n++;
		} else {
			units.push({ node: child, parentPath });
			counter.n++;
		}
	}
}

function resolvePath(root: ParentNode, path: number[]): ParentNode {
	let node: ParentNode = root;
	for (const idx of path) node = node.children[idx];
	return node;
}

export function planProgressiveRender(
	sanitized: DocumentFragment,
	opts: PlanOptions = {},
): ProgressiveRender | null {
	const headUnits = opts.headUnits ?? 6;
	const threshold = opts.threshold ?? 60;
	const units: ProgressiveUnit[] = [];
	const counter = { n: 0 };
	walk(sanitized, [], units, counter);
	const unitCount = counter.n;
	if (unitCount <= threshold) return null;

	// head：前 headUnits 个单元按路径组装进片段（克隆语义：wrapper 用壳、块用整克隆；
	// sanitized 本体保持完整不动，供排空后的 memo 对齐 pass 使用）
	const head = document.createDocumentFragment();
	for (const unit of units.slice(0, headUnits)) {
		const parent = resolvePath(head, unit.parentPath);
		const clone = isFoldWrapper(unit.node) ? cloneWrapperShell(unit.node) : unit.node.cloneNode(true);
		parent.append(clone);
	}
	const rest = units.slice(headUnits);
	return {
		head,
		units: rest,
		unitCount,
		drain(host, drainOpts = {}) {
			return drainUnits(host, rest, drainOpts);
		},
	};
}

function drainUnits(host: HTMLElement, units: ProgressiveUnit[], opts: DrainOptions): Promise<void> {
	const budgetMs = opts.budgetMs ?? 24;
	const schedule = opts.schedule ?? ((cb: () => void) => requestAnimationFrame(() => cb()));
	return new Promise((resolve) => {
		let i = 0;
		const step = () => {
			if (i >= units.length || !host.isConnected) return resolve();
			const t0 = performance.now();
			const batch: Element[] = [];
			while (i < units.length) {
				const unit = units[i++];
				const parent = resolvePath(host, unit.parentPath);
				const clone = isFoldWrapper(unit.node) ? cloneWrapperShell(unit.node) : unit.node.cloneNode(true);
				parent.append(clone);
				batch.push(clone as Element);
				void host.offsetHeight; // 每单元强制布局——帧预算量在这里
				if (performance.now() - t0 > budgetMs) break;
			}
			opts.onBatch?.(batch);
			if (i >= units.length || !host.isConnected) return resolve();
			schedule(step);
		};
		step();
	});
}
