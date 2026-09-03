// @deepseek-ai/dsh-apb/host
//
// APB（Ask / Plan / Build）三模式会话状态的 Host 端入口。
//
// 设计约束：
// - 模式按会话持久化为 `apb/mode` 事件，后写入的事件生效，默认值为
//   `ask`；因此恢复会话和派生会话都可以从事件重建状态，不依赖实时镜像。
// - 通过 `/apb`（或最终执行该命令的客户端快捷键）切换模式时，同时通过
//   `permissionPresets` 写入 Host 权限预设：ask/plan -> `read-only`，
//   build -> `workspace-write`。这是文件沙箱和审批开关的真实约束，不是
//   仅靠提示词要求模型“请保持只读”。
// - `ask` 是默认模式，提示词区段保持为空；规划和构建规则由 APB 自己提供，
//   避免再依赖另一套 plan 状态机。
// - 会话投影 `apbMode` 向客户端暴露 `{ enabled, mode }`。`enabled` 会折叠
//   当前会话自己的 `agent-preset/selected` 事件，只有使用 apb-coding 预设
//   的会话才显示客户端模式按钮。
//
// 模块输入：Cordis Host 上的会话事件、权限服务和命令/投影注册表。
// 模块输出：APB 服务、模式提示词、权限副作用、`apbMode` 投影和 `/apb` 命令。

import { Service } from "@deepseek-ai/cordis";
import { z } from "zod";

/** 按循环顺序排列的三个模式标识。标识是协议的一部分，不要翻译。 */
const MODES = ["ask", "plan", "build"];
/** 尚未记录模式事件的会话所使用的默认模式。 */
const DEFAULT_MODE = "ask";
/** 本插件服务的 apb-coding 预设标识。 */
const APB_PRESET = "apb-coding";
/** 模式到 Host 权限预设的映射。 */
const MODE_PERMISSION = {
	ask: "read-only",
	plan: "read-only",
	build: "workspace-write"
};

/**
 * 从会话事件中折叠出最后一次有效的 APB 模式。
 * @param {Array<{type: string, data?: object}>} events 会话事件列表。
 * @returns {"ask"|"plan"|"build"} 当前模式；没有有效事件时返回 `ask`。
 */
function foldMode(events) {
	let mode = DEFAULT_MODE;
	for (const event of events) {
		if (event.type === "apb/mode" && MODES.includes(event.data?.mode)) mode = event.data.mode;
	}
	return mode;
}

/**
 * 判断会话是否已经记录过有效的 APB 模式事件。
 * @param {Array<{type: string, data?: object}>} events 会话事件列表。
 * @returns {boolean} 是否存在可持久化恢复的模式选择。
 */
function hasLoggedMode(events) {
	return events.some((event) => event.type === "apb/mode" && MODES.includes(event.data?.mode));
}

/**
 * 将模式对应的 Host 权限预设应用到会话，即使模式本身没有变化也会执行。
 * @param {object} ctx Cordis Host 上下文，用于获取权限服务。
 * @param {object} session 要同步权限的会话对象。
 * @param {"ask"|"plan"|"build"} mode 目标 APB 模式。
 * @returns {void}
 * @throws {Error} Host 未提供 `permissionPresets` 服务时抛出错误。
 */
function syncPermission(ctx, session, mode) {
	const permission = ctx.get("permissionPresets");
	if (permission === void 0) throw new Error("APB 需要 permissionPresets 服务");
	permission.set(session, MODE_PERMISSION[mode]);
}

/**
 * 从会话事件中折叠出当前会话自己的 agent preset 选择。
 * @param {Array<{type: string, data?: object}>} events 会话事件列表。
 * @returns {string|undefined} 最后一次选择的预设标识；尚未选择时返回 undefined。
 */
function foldPreset(events) {
	let preset;
	for (const event of events) {
		if (event.type === "agent-preset/selected" && typeof event.data?.agentPreset === "string") preset = event.data.agentPreset;
	}
	return preset;
}

/**
 * 返回当前模式对应的系统提示词区段；`ask` 默认不增加额外提示。
 * @param {"ask"|"plan"|"build"} mode APB 模式标识。
 * @returns {string} 要注入系统提示词的中文规则文本。
 */
function modeSection(mode) {
	switch (mode) {
		case "plan":
			return `[APB] 规划模式：当前仅允许只读操作。使用不会改变仓库的读取、搜索、静态分析和检查来了解项目。请产出可直接执行的完整实施计划，覆盖目标、成功标准、入口、文件级修改、模块顺序、边界情况、失败模式、测试和验证方式。不得编辑文件、修改配置、运行会重写内容的格式化器或生成器、提交代码，或以其他方式实施计划。在回复中给出计划，并等待用户通过 /apb build 或 APB 按钮显式切换；仅有对话中的“同意”不构成实施授权。`;
		case "build":
			return "[APB] 构建模式：执行已经确认的对话或计划；当前允许写入文件。";
		default:
			return "";
	}
}

/**
 * APB Host 服务入口。
 *
 * 该服务负责记录会话模式、每次选择时同步 Host 权限、注册模式提示词、
 * 注册 `apbMode` 客户端投影以及注册 `/apb` 命令。UI 只通过已经提交的
 * 投影观察状态，不维护另一份实时镜像。
 *
 * 输入：Cordis 上下文及其会话/权限/命令/投影服务。
 * 输出：`get`/`set` 两个服务方法，以及上述提示词、投影和命令副作用。
 */
var ApbModeController = class extends Service {
	static inject = ["systemPrompt"];
	/** 注册 APB Host 服务及其会话入口、提示词出口、投影出口和命令出口。 */
	constructor(ctx) {
		super(ctx, "apbMode");
		// 会话入口：首次启动、恢复或派生 APB 会话时，先把真实权限同步好。
		ctx.on("agent/session-start", ({ agent }) => {
			const session = agent.session;
			if (foldPreset(session.events) !== APB_PRESET) return;

			const mode = foldMode(session.events);
			// permissionPresets 会在创建会话时固定自己的默认值。APB 必须在第一轮
			// 模型调用前重新校准它；恢复和派生会话也走这里，并记录隐式 ask 状态，
			// 供之后重放事件时使用。
			syncPermission(ctx, session, mode);
			if (!hasLoggedMode(session.events)) session.append("apb/mode", { mode });
		});
		// 提示词出口：每次组装系统提示词时，根据会话事件计算当前模式规则。
		ctx.systemPrompt.section({
			name: "apb:policy",
			order: 90,
			text: (context) => {
				if (context.agent === void 0) return "";
				return modeSection(foldMode(context.agent.session.events));
			}
		});
		// 投影出口：将 Host 会话状态转换成客户端可消费的 enabled/mode 视图。
		ctx.inject(["sessionProjections"], (projectionCtx) => {
			const stateSchema = z.object({
				mode: z.enum(MODES),
				preset: z.string().nullable()
			});
			const viewSchema = z.object({
				enabled: z.boolean(),
				mode: z.enum(MODES)
			});
			projectionCtx.sessionProjections.register({
				key: "apbMode",
				stateSchema,
				init: () => ({ mode: DEFAULT_MODE, preset: null }),
				apply: (state, event) => {
					if (event.type === "apb/mode") return { ...state, mode: event.data.mode };
					if (event.type === "agent-preset/selected") return { ...state, preset: event.data.agentPreset ?? null };
					return state;
				},
				wire: {
					viewSchema,
					view: (state) => ({
						enabled: state.preset === APB_PRESET,
						mode: state.mode
					})
				},
				stateVersion: 1
			});
		});
		// 命令入口：接收 `/apb` 的文本参数；出口是成功/错误反馈，并在需要时
		// 写入模式事件和同步真实权限。
		ctx.inject(["commands"], (commandCtx) => {
			commandCtx.commands.register({
				name: "apb",
				description: "切换 APB 模式（ask/plan/build）并同步对应权限预设",
				input: { hint: "[ask|plan|build|next|status]" },
				handler: ({ agent, rawInput }) => {
					const arg = rawInput.trim();
					const session = agent.session;
					const current = foldMode(session.events);
					if (arg === "" || arg === "status") {
						const permission = ctx.get("permissionPresets");
						const effective = permission?.current(session.events) ?? "unavailable";
						return {
							kind: "success",
							text: `APB 模式：${current}（目标权限：${MODE_PERMISSION[current]}；当前有效权限：${effective}）`
						};
					}
					let target;
					if (arg === "next") {
						target = MODES[(MODES.indexOf(current) + 1) % MODES.length];
					} else if (MODES.includes(arg)) {
						target = arg;
					} else {
						return {
							kind: "error",
							text: `未知 APB 模式“${arg}”（可用值：${MODES.join("、")}、next、status）`
						};
					}
					if (target === current) {
						syncPermission(ctx, session, target);
						return {
							kind: "success",
							text: `APB 模式未变化，仍为 ${current}；权限预设已重新同步为 ${MODE_PERMISSION[current]}。`
						};
					}
					syncPermission(ctx, session, target);
					session.append("apb/mode", { mode: target });
					return {
						kind: "success",
						text: `APB 模式：${current} -> ${target}（权限预设：${MODE_PERMISSION[target]}）。`
					};
				}
			});
		});
	}
	/**
	 * 服务出口：读取指定 Agent 会话事件折叠出的当前模式。
	 * @param {object} agent 要读取的 Agent。
	 * @returns {"ask"|"plan"|"build"} 当前生效的 APB 模式。
	 */
	get(agent) {
		return foldMode(agent.session.events);
	}
	/**
	 * 服务出口：立即为指定 Agent 选择模式，行为等价于 `/apb ask|plan|build`。
	 * 即使目标模式与当前模式相同，也会重新应用目标权限，修复状态脱节。
	 * @param {object} agent 要切换模式的 Agent。
	 * @param {"ask"|"plan"|"build"} mode 目标模式。
	 * @returns {"ask"|"plan"|"build"} 当前生效的模式。
	 * @throws {Error} mode 不是受支持的模式时抛出错误。
	 */
	set(agent, mode) {
		if (!MODES.includes(mode)) throw new Error(`unknown APB mode "${mode}" (available: ${MODES.join(", ")})`);
		const session = agent.session;
		const current = foldMode(session.events);
		syncPermission(this.ctx, session, mode);
		if (mode !== current) {
			session.append("apb/mode", { mode });
		}
		return mode;
	}
};
//#endregion
// 对外导出常量、纯函数和 Host 服务；`default` 兼容 Cordis 的默认服务加载方式。
export { APB_PRESET, DEFAULT_MODE, MODES, MODE_PERMISSION, ApbModeController, ApbModeController as default, foldMode, hasLoggedMode, modeSection, syncPermission };
