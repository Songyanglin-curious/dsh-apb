/**
 * APB 浏览器端入口模块。
 *
 * 输入：Host 端发布的 `apbMode` 会话投影，以及 Remote 命令执行服务。
 * 输出：通过 `exports.inject` 声明依赖，通过 `exports.apply` 将模式标签
 * 注册到 composer 右侧插槽；标签点击或 Alt+M 会执行 `/apb next`，不在
 * 浏览器端复制模式状态或权限逻辑。
 */
window.__ModuleLoader__.load({
	id: "@deepseek-ai/dsh-apb",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		//#region APB 模式标签与快捷键
		/**
		 * Composer 工具栏（`conversation.input.right`）中的 APB 模式标签。
		 *
		 * 数据和切换都通过 Host 的 `apbMode` 投影完成：投影不存在或 `enabled`
		 * 为 false（即当前会话没有运行 apb-coding 预设）时不渲染。显示与否
		 * 由投影数据决定，而不是客户端自行判断预设名。标签显示当前模式，
		 * 并通过 `/apb next` 命令按 ask -> plan -> build -> ask 循环。
		 */
		const MODE_LABEL = {
			ask: "询问",
			plan: "规划",
			build: "构建"
		};
		const MODE_COLOR = {
			ask: "var(--dsw-alias-state-info-primary)",
			plan: "var(--dsw-alias-state-warn-primary)",
			build: "var(--dsw-alias-state-success-primary)"
		};
		// 快捷键：Alt+M 循环切换模式。需要改键时修改下面的 HOTKEY 并重新构建
		// 客户端 bundle（`pnpm run dev:web` 会自动监视并重建）。
		const HOTKEY = { key: "m", altKey: true, shiftKey: false, ctrlKey: false, metaKey: false };
		/**
		 * 判断键盘事件是否匹配 APB 模式快捷键。
		 * @param {KeyboardEvent} e 浏览器键盘事件。
		 * @returns {boolean} 是否为未附加其他修饰键的 Alt+M。
		 */
		function matchesHotkey(e) {
			return (typeof e.key === "string" && e.key.toLowerCase() === HOTKEY.key &&
				e.altKey === HOTKEY.altKey && e.shiftKey === HOTKEY.shiftKey &&
				e.ctrlKey === HOTKEY.ctrlKey && e.metaKey === HOTKEY.metaKey);
		}
		/**
		 * 渲染 APB 模式标签，并处理键盘/鼠标触发的模式循环。
		 * @param {object} props 由插槽系统传入的组件参数。
		 * @param {Function} props.useProjection 读取会话投影的 Hook。
		 * @param {Function} props.cycle 执行下一模式命令的异步函数。
		 * @returns {React.ReactElement|null} APB 标签；非 APB 会话返回 null。
		 */
		function ApbModeChip(props) {
			const useProjection = props.useProjection;
			const cycle = props.cycle;
			const apb = useProjection("apbMode");
			const [busy, setBusy] = (0, react.useState)(false);
			const enabled = apb !== void 0 && apb.enabled !== false;
			const cycleRef = (0, react.useRef)(null);
			cycleRef.current = enabled && typeof cycle === "function" ? cycle : null;
			(0, react.useEffect)(() => {
				if (!enabled) return void 0;
				const onKey = (e) => {
					const run = cycleRef.current;
					if (!run) return;
					if (matchesHotkey(e)) {
						e.preventDefault();
						setBusy(true);
						// 先锁定按钮，避免一次按键触发并发切换；无论成功失败都解锁。
						run().then(() => setBusy(false), () => setBusy(false));
					}
				};
				window.addEventListener("keydown", onKey);
				return () => window.removeEventListener("keydown", onKey);
			}, [enabled]);
			if (!enabled) return null;
			const mode = apb.mode || "ask";
			const color = MODE_COLOR[mode] || "currentColor";
			const next = () => {
				const run = cycleRef.current;
				if (!run || busy) return void 0;
				setBusy(true);
				// 点击与快捷键共用同一个 Remote 命令入口。
				run().then(() => setBusy(false), () => setBusy(false));
			};
			const onKeyDown = (e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					next();
				}
			};
			return (0, react.createElement)("span", {
				onClick: next,
				onKeyDown,
				role: "button",
				tabIndex: busy ? -1 : 0,
				"aria-disabled": busy ? "true" : "false",
				title: "APB 模式：" + (MODE_LABEL[mode] || mode) + "（Alt+M 或点击循环切换：询问 → 规划 → 构建）",
				"aria-label": "APB 模式：" + (MODE_LABEL[mode] || mode) + "；点击切换"
			}, (0, react.createElement)("span", {
				style: {
					color,
					fontSize: 13,
					fontWeight: 500,
					lineHeight: "20px",
					padding: "2px 8px",
					border: "1px solid " + color,
					borderRadius: 999,
					cursor: busy ? "default" : "pointer",
					opacity: busy ? 0.6 : 1
				}
			}, "APB\u00b7" + (MODE_LABEL[mode] || mode)));
		}
		//#endregion
		// 客户端依赖：当前 seat 的插槽注册表，以及用于执行 Host 命令的 Remote 服务。
		const inject = ["slots", "remote", "remote.commands"];
		/**
		 * 客户端注册入口：把 APB 模式标签挂载到 composer 右侧，并将切换请求
		 * 转发给 Host 的 `/apb next` 命令。
		 * @param {object} ctx 客户端根上下文，提供 slots 和 remote 服务。
		 * @returns {void}
		 */
		function apply(ctx) {
			// 注册出口：标签可见性由投影驱动，切换结果由 Remote 命令返回。
			ctx.slots.inject("conversation.input.right", () => ctx.slots.register({
				name: "conversation.input.right",
				id: "apb-mode",
				order: 20,
				inject: (sessionId) => ({
					cycle: async () => {
						const result = await ctx.remote.commands.execute(sessionId, "/apb next", []);
						return result.ok ? null : ((result.error && result.error.message) || "命令执行失败") + ((result.error && result.error.code) ? "（" + result.error.code + "）" : "");
					}
				})
			}, ApbModeChip));
		}
		//#endregion
		// 对外导出客户端注册入口和依赖入口；包加载器会读取这两个字段。
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
