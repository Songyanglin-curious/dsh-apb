window.__ModuleLoader__.load({
	id: "@deepseek-ai/dsh-apb",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		//#region APB mode chip + hotkey
		/**
		 * APB mode chip for the composer tool row (`conversation.input.right`).
		 *
		 * Data and submission ride the host `apbMode` projection: when the
		 * projection is absent or `enabled` is false (any session not running
		 * the apb-coding preset) the component renders nothing — visibility is
		 * data-driven, not a client-side preset-name check. The chip shows the
		 * current mode and cycles ask -> plan -> build -> ask through the
		 * `/apb next` command channel (same channel `/plan off` uses).
		 */
		const MODE_LABEL = {
			ask: "ask",
			plan: "plan",
			build: "build"
		};
		const MODE_COLOR = {
			ask: "var(--dsw-alias-state-info-primary)",
			plan: "var(--dsw-alias-state-warn-primary)",
			build: "var(--dsw-alias-state-success-primary)"
		};
		// Hotkey: Alt+M cycles modes. To rebind, edit HOTKEY below and rebuild the
		// client bundle (pnpm run dev:web watches and rebuilds automatically).
		const HOTKEY = { key: "m", altKey: true, shiftKey: false, ctrlKey: false, metaKey: false };
		function matchesHotkey(e) {
			return (typeof e.key === "string" && e.key.toLowerCase() === HOTKEY.key &&
				e.altKey === HOTKEY.altKey && e.shiftKey === HOTKEY.shiftKey &&
				e.ctrlKey === HOTKEY.ctrlKey && e.metaKey === HOTKEY.metaKey);
		}
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
				if (!run) return void 0;
				setBusy(true);
				run().then(() => setBusy(false), () => setBusy(false));
			};
			return (0, react.createElement)("button", {
				type: "button",
				onClick: next,
				disabled: busy,
				title: "APB mode: " + mode + " — Alt+M or click to cycle (ask \u2192 plan \u2192 build)",
				"aria-label": "APB mode " + mode + "; click to switch"
			}, (0, react.createElement)("span", {
				style: {
					color,
					fontSize: 13,
					fontWeight: 500,
					lineHeight: "20px",
					padding: "2px 8px",
					border: "1px solid " + color,
					borderRadius: 999,
					opacity: busy ? 0.6 : 1
				}
			}, "APB\u00b7" + (MODE_LABEL[mode] || mode)));
		}
		//#endregion
		/** Required client services: the seat's slot registry and the commands Remote. */
		const inject = ["slots", "remote", "remote.commands"];
		/**
		 * Client plugin body: register the APB mode chip over the command channel.
		 * @param ctx - client root context.
		 */
		function apply(ctx) {
			ctx.slots.inject("conversation.input.right", () => ctx.slots.register({
				name: "conversation.input.right",
				id: "apb-mode",
				order: 20,
				inject: (sessionId) => ({
					cycle: async () => {
						const result = await ctx.remote.commands.execute(sessionId, "/apb next", []);
						return result.ok ? null : ((result.error && result.error.message) || "command failed") + ((result.error && result.error.code) ? " (" + result.error.code + ")" : "");
					}
				})
			}, ApbModeChip));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
