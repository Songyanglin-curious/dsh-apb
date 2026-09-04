/**
 * APB 浏览器端入口模块。
 *
 * 输入：Host 端发布的瞬时 `apbMode` Remote 服务，以及 Remote 命令结果。
 * 输出：通过 `exports.inject` 声明依赖，通过 `exports.apply` 将模式标签
 * 注册到 composer 右侧插槽；标签点击或 Alt+M 会调用 Host 的瞬时模式 Remote，
 * 浏览器端只显示 Host 返回的当前快照，不复制权限逻辑。
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
         * 数据和切换都通过 Host 的 `apbMode` Remote 服务完成：`enabled` 为 false
         *（即当前会话没有运行 apb-coding 预设）时不渲染。Host 内存状态是唯一
         * 权威值；浏览器只保留当前响应的显示快照。
         */
        const MODE_LABEL = {
            ask: "ask",
            plan: "plan",
            build: "build"
        };
        const MODE_COLOR = {
            ask: "var(--dsw-alias-state-info-primary, #1677ff)",
            plan: "var(--dsw-alias-state-success-primary, #16a34a)",
            build: "var(--dsw-alias-state-warn-primary, #f59e0b)"
        };
        const sessionIdSchema = {
            parse: (value) => {
                if (typeof value !== "string" || value.length === 0) throw new TypeError("sessionId must be a non-empty string");
                return value;
            }
        };
        const apbStateSchema = {
            parse: (value) => {
                if (value === null || typeof value !== "object" || typeof value.enabled !== "boolean" || !MODE_LABEL[value.mode]) {
                    throw new TypeError("invalid APB state response");
                }
                return { enabled: value.enabled, mode: value.mode };
            }
        };
        /** 本插件自己的 Client Remote 贡献；状态不经过 session projection。 */
        const APB_REMOTE = {
            package: "@deepseek-ai/dsh-apb",
            descriptors: ["get", "cycle"].map((method) => ({
                id: `@deepseek-ai/dsh-apb#apbMode/${method}`,
                service: "apbMode",
                namespace: "apbMode",
                method,
                implementation: method === "get" ? "remoteGet" : "remoteCycle",
                invocation: { kind: "direct" },
                parameters: [{
                    name: "agent",
                    wire: "agentId",
                    source: "lookup",
                    lookup: "agent",
                    codec: {
                        mode: "strict",
                        typeSymbol: "@deepseek-ai/dsh-session/types#SessionId",
                        schema: sessionIdSchema
                    }
                }],
                result: {
                    mode: "strict",
                    typeSymbol: `@deepseek-ai/dsh-apb#apbMode/${method}:result`,
                    schema: apbStateSchema
                }
            }))
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
         * APB 模式切换只改变会话状态，不在对话流中重复展示成功提示。
         * 失败结果仍保留可见反馈，`/apb status` 等查询命令也不隐藏。
         * @param {object} props 命令行渲染插槽参数。
         * @returns {React.ReactElement|null} 命令卡片或隐藏结果。
         */
        function ApbCommandView(props) {
            const node = props.node;
            const args = typeof node?.args === "string" ? node.args.trim() : "";
            const isModeSwitch = node?.name === "apb" && ["ask", "plan", "build", "next"].includes(args);
            const startedPending = (0, react.useRef)(node.outcome === null);
            const reported = (0, react.useRef)(false);
            (0, react.useEffect)(() => {
                // 只同步本次页面生命周期中刚完成的手工 `/apb` 命令；打开旧历史时
                // 已完成的命令不得重新恢复过去的模式。
                if (reported.current || !startedPending.current || !isModeSwitch || node.outcome?.kind === "error") return;
                const match = node.outcome?.text?.match(/APB 模式：(ask|plan|build)(?: -> (ask|plan|build))?/);
                const mode = match?.[2] || match?.[1];
                if (mode) {
                    reported.current = true;
                    window.dispatchEvent(new CustomEvent("dsh-apb-mode", { detail: { mode } }));
                }
            }, [isModeSwitch, node.outcome]);
            if (isModeSwitch && node.outcome?.kind !== "error") return null;
            const text = node.outcome === null ? "命令执行中…" : (node.outcome?.text || (node.outcome?.kind === "error" ? "命令执行失败" : "命令已完成"));
            return (0, react.createElement)("div", {
                role: node.outcome?.kind === "error" ? "alert" : "status",
                style: {
                    color: node.outcome?.kind === "error" ? "var(--dsw-alias-state-error-primary)" : "var(--dsw-alias-label-tertiary)",
                    fontSize: 13,
                    padding: "4px 0",
                    whiteSpace: "pre-wrap"
                }
            }, text);
        }
        /**
         * 渲染 APB 模式标签，并处理键盘/鼠标触发的模式循环。
         * @param {object} props 由插槽系统传入的组件参数。
         * @param {string} props.sessionId 当前会话 id。
         * @param {Function} props.getState 从 Host 读取当前瞬时状态。
         * @param {Function} props.cycle 请求 Host 切换到下一模式的异步函数。
         * @returns {React.ReactElement|null} APB 标签；非 APB 会话返回 null。
         */
        function ApbModeChip(props) {
            const sessionId = props.sessionId;
            const getState = props.getState;
            const cycle = props.cycle;
            const [apb, setApb] = (0, react.useState)(null);
            const [busy, setBusy] = (0, react.useState)(false);
            const [error, setError] = (0, react.useState)("");
            const enabled = apb?.enabled === true;
            const cycleRef = (0, react.useRef)(null);
            cycleRef.current = enabled && typeof cycle === "function" ? cycle : null;
            (0, react.useEffect)(() => {
                let active = true;
                setApb(null);
                setError("");
                getState().then((state) => {
                    if (active) setApb(state);
                }, (reason) => {
                    if (active) setError(reason instanceof Error ? reason.message : String(reason));
                });
                return () => { active = false; };
            }, [sessionId]);
            (0, react.useEffect)(() => {
                if (!enabled) return void 0;
                const onKey = (e) => {
                    const run = cycleRef.current;
                    if (!run) return;
                    if (matchesHotkey(e)) {
                        e.preventDefault();
                        setBusy(true);
                        // 先锁定按钮，避免一次按键触发并发切换；无论成功失败都解锁。
                        run().then((state) => {
                            setApb(state);
                            setError("");
                            setBusy(false);
                        }, (reason) => {
                            setError(reason instanceof Error ? reason.message : String(reason));
                            setBusy(false);
                        });
                    }
                };
                window.addEventListener("keydown", onKey);
                return () => window.removeEventListener("keydown", onKey);
            }, [enabled]);
            (0, react.useEffect)(() => {
                const onMode = (event) => {
                    const mode = event.detail?.mode;
                    if (MODE_LABEL[mode]) setApb({ enabled: true, mode });
                };
                window.addEventListener("dsh-apb-mode", onMode);
                return () => window.removeEventListener("dsh-apb-mode", onMode);
            }, [sessionId]);
            if (error && apb === null) {
                return (0, react.createElement)("span", {
                    role: "alert",
                    title: error,
                    style: { color: "var(--dsw-alias-state-error-primary, #dc2626)", fontSize: 13 }
                }, "APB·错误");
            }
            if (!enabled) return null;
            const mode = apb.mode || "ask";
            const color = MODE_COLOR[mode] || "currentColor";
            const next = () => {
                const run = cycleRef.current;
                if (!run || busy) return void 0;
                setBusy(true);
                // 点击与快捷键共用同一个瞬时 Remote 服务入口。
                run().then((state) => {
                    setApb(state);
                    setError("");
                    setBusy(false);
                }, (reason) => {
                    setError(reason instanceof Error ? reason.message : String(reason));
                    setBusy(false);
                });
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
                title: (error ? error + "；" : "") + "APB 模式：" + (MODE_LABEL[mode] || mode) + "（Alt+M 或点击循环切换：询问 → 规划 → 构建）",
                "aria-label": "APB 模式：" + (MODE_LABEL[mode] || mode) + "；点击切换"
            }, (0, react.createElement)("span", {
                style: {
                    color,
                    fontSize: 13,
                    fontWeight: 500,
                    lineHeight: "20px",
                    padding: "2px 8px",
                    // 三种模式统一使用胶囊边框，确保询问模式也有清晰轮廓。
                    border: "1px solid " + color,
                    borderRadius: 999,
                    cursor: busy ? "default" : "pointer",
                    opacity: busy ? 0.6 : 1
                }
            }, "APB\u00b7" + (MODE_LABEL[mode] || mode)));
        }
        //#endregion
        // 客户端依赖：当前 seat 的插槽注册表，以及 APB Host Remote 服务。
        const inject = ["slots", "remote"];
        /**
         * 客户端注册入口：把 APB 模式标签挂载到 composer 右侧，并将读取/切换请求
         * 转发给 Host 的 `apbMode` Remote 服务。
         * @param {object} ctx 客户端根上下文，提供 slots 和 remote 服务。
         * @returns {void}
         */
        async function apply(ctx) {
            // 先登记 UI effect；Web boot 会等待本 apply 完成后才开始渲染。
            let apbRemote;
            // 模式切换成功后只更新瞬时 UI，不在对话流中渲染一条重复提示。
            ctx.slots.inject("conversation.chat.commandview", () => ctx.slots.register({
                name: "conversation.chat.commandview",
                key: "apb"
            }, ApbCommandView));
            // 注册出口：首次渲染读取 Host 权威状态，切换直接调用瞬时 Remote 服务。
            ctx.slots.inject("conversation.input.right", () => ctx.slots.register({
                name: "conversation.input.right",
                id: "apb-mode",
                order: 20,
                inject: (sessionId) => ({
                    sessionId,
                    getState: async () => {
                        const result = await apbRemote.get(sessionId);
                        if (result.ok) return result.value;
                        throw new Error((result.error && result.error.message) || "读取 APB 模式失败");
                    },
                    cycle: async () => {
                        const result = await apbRemote.cycle(sessionId);
                        if (result.ok) return result.value;
                        throw new Error((result.error && result.error.message) || "切换 APB 模式失败");
                    }
                })
            }, ApbModeChip));
            // dsh-api-remotes 只预挂载核心包；第三方 bundle 需要挂载自己的严格描述符。
            await ctx.remote.$mount(APB_REMOTE);
            apbRemote = ctx.get("remote.apbMode");
            if (apbRemote === void 0) throw new Error("APB Remote namespace did not mount");
        }
        //#endregion
        // 对外导出客户端注册入口和依赖入口；包加载器会读取这两个字段。
        exports.apply = apply;
        exports.inject = inject;
        return module.exports;
    }
});
