// @deepseek-ai/dsh-apb/host
//
// APB（Ask / Plan / Build）三模式运行状态的 Host 端入口。
//
// 设计约束：
// - 模式是当前 Host 进程中按 Session 隔离的瞬时控制档位，不写入 session log；
//   新建、恢复和重新挂载 APB 会话都从安全的 `ask` 开始。
// - 通过 `/apb`（或最终执行该命令的客户端快捷键）切换模式时，同时通过
//   `permissionPresets` 写入 Host 权限预设：ask/plan -> `read-only`，
//   build -> `workspace-write`。这是文件沙箱和审批开关的真实约束，不是
//   仅靠提示词要求模型“请保持只读”。
// - `ask` 是默认模式；三种模式的稳定定义由 preset persona 一次性提供，当前模式
//   及当前行动目标作为运行时上下文暴露，切换模式不会改写系统提示词。
// - 客户端通过 `apbMode/get|cycle` Remote 方法读取和切换 Host 内存状态，不建立
//   浏览器状态源，也不借助持久化 session projection。
//
// 模块输入：Cordis Host 上的会话事件、权限服务、系统提示词和命令注册表。
// 模块输出：APB Remote 服务、模式运行时上下文、权限副作用和 `/apb` 命令。

import { TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";

/** 按循环顺序排列的三个模式标识。标识是协议的一部分，不要翻译。 */
const MODES = ["ask", "plan", "build"];
/** 每次 APB 会话激活时使用的安全默认模式。 */
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
 * 将已经选择 APB preset 的会话初始化到当前模式及其权限。
 * @param {object} ctx Cordis Host 上下文。
 * @param {object} session 要同步权限的会话对象。
 * @returns {void}
 */
/**
 * 从会话历史中折叠出当前会话自己的 agent preset 选择。
 *
 * 预设既可能记录为 `agent-preset/selected` 事件（会话中途切换预设），也可能只写
 * 在创建时不可变的 `session.header.agentPreset`（初始组合）。`resolveSessionPreset`
 * 的语义是事件优先、header 兜底；本函数与其保持一致，否则新建会话（header 带
 * apb-coding 但尚无事件）会被误判为未启用 APB。
 * @param {object|null|undefined} session 会话对象，读取其 `events` 与 `header`。
 * @returns {string|undefined} 最后一次选择的预设标识；尚未选择时返回 undefined。
 */
function foldPreset(session) {
	let preset = session?.header?.agentPreset;
	const events = session?.events;
	if (Array.isArray(events)) {
		for (const event of events) {
			if (event.type === "agent-preset/selected" && typeof event.data?.agentPreset === "string") preset = event.data.agentPreset;
		}
	}
	return preset;
}

/**
 * 返回模型可见的当前 APB 模式运行时上下文。
 * @param {"ask"|"plan"|"build"} mode APB 模式标识。
 * @returns {string} 仅描述当前状态、不重复静态模式规则的上下文文本。
 */
function modeContext(mode) {
	const instructions = {
		ask: "Discuss with the user to clarify the goal, constraints, boundaries, and acceptance criteria. Do not create a formal implementation plan or modify files.",
		plan: "Use the latest existing plan together with all Ask clarifications made after it to produce an updated complete plan. If no plan exists, create one from the accumulated Ask discussion. Do not implement changes.",
		build: "Implement the latest plan. If no plan exists, implement directly from the accumulated Ask clarifications. Run appropriate verification and distinguish completed, unrun, and blocked checks."
	};
	return `Current APB mode: ${mode}. ${instructions[mode]}`;
}

/**
 * APB Host 服务入口。
 *
 * 该服务负责保存进程内会话模式、每次选择时同步 Host 权限、注册模式上下文、
 * 提供客户端 Remote 接口以及注册 `/apb` 命令。UI 每次从本服务读取权威值。
 *
 * 输入：Cordis 上下文及其会话、权限、系统提示词和命令服务。
 * 输出：进程内状态方法、Remote 方法，以及上述上下文和命令副作用。
 */
var ApbModeController = class extends TypertRemoteService {
	static inject = ["systemPrompt"];
	/** @type {WeakMap<object, "ask"|"plan"|"build">} */
	modes = new WeakMap();
	/** 注册 APB Host 服务及其会话入口、上下文出口、Remote 出口和命令出口。 */
	constructor(ctx) {
		super(ctx, "apbMode");
		// 会话入口：新建、恢复或重新挂载 APB 会话时，都从 ask 和只读权限开始。
		ctx.on("agent/session-start", ({ agent }) => {
			const session = agent.session;
			if (foldPreset(session) !== APB_PRESET) return;
			this.reset(session);
		});
		// 运行中的会话切入 APB preset 时，不会重新触发 session-start；监听
		// preset 选择事件，立即把左侧 Host 权限校准到当前 APB 模式。
		ctx.on("session/event", (session, event) => {
			if (event.type !== "agent-preset/selected") return;
			if (event.data?.agentPreset === APB_PRESET) this.reset(session);
			else this.modes.delete(session);
		});
		// 运行时上下文出口：静态 persona 保持不变，只注入当前模式及其行动目标。
		ctx.systemPrompt.context({
			name: "apb:mode",
			order: 90,
			text: (context) => {
				if (context.agent === void 0) return "";
				if (foldPreset(context.agent.session) !== APB_PRESET) return "";
				return modeContext(this.modeOf(context.agent.session));
			}
		});
		// 命令入口：接收 `/apb` 的文本参数；出口是成功/错误反馈，并同步
		// 当前进程内模式和真实权限，不写入 APB 私有 session event。
		ctx.inject(["commands"], (commandCtx) => {
			commandCtx.commands.register({
				name: "apb",
				description: "切换 APB 模式（ask/plan/build）并同步对应权限预设",
				input: { hint: "[ask|plan|build|next|status]" },
				handler: ({ agent, rawInput }) => {
					const arg = rawInput.trim();
					const session = agent.session;
					if (foldPreset(session) !== APB_PRESET) {
						return { kind: "error", text: "当前会话未启用 APB 渐进编码助手。" };
					}
					const current = this.modeOf(session);
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
					this.set(agent, target);
					return {
						kind: "success",
						text: `APB 模式：${current} -> ${target}（权限预设：${MODE_PERMISSION[target]}）。`
					};
				}
			});
		});
	}
	/** 将一个活动会话重置为 ask，并立即同步只读权限。 */
	reset(session) {
		this.modes.set(session, DEFAULT_MODE);
		syncPermission(this.ctx, session, DEFAULT_MODE);
		return DEFAULT_MODE;
	}
	/** 读取进程内模式；尚未初始化时安全回退到 ask。 */
	modeOf(session) {
		return this.modes.get(session) ?? DEFAULT_MODE;
	}
	/**
	 * 服务出口：读取指定 Agent 会话事件折叠出的当前模式。
	 * @param {object} agent 要读取的 Agent。
	 * @returns {"ask"|"plan"|"build"} 当前生效的 APB 模式。
	 */
	get(agent) {
		return this.modeOf(agent.session);
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
		if (foldPreset(session) !== APB_PRESET) throw new Error("current session does not use the apb-coding preset");
		syncPermission(this.ctx, session, mode);
		this.modes.set(session, mode);
		return mode;
	}
	/** 返回客户端所需的瞬时 APB 状态。 */
	remoteGet(agent) {
		const enabled = foldPreset(agent.session) === APB_PRESET;
		return { enabled, mode: enabled ? this.get(agent) : DEFAULT_MODE };
	}
	/** 从客户端循环到下一模式，并返回切换后的权威状态。 */
	remoteCycle(agent) {
		if (foldPreset(agent.session) !== APB_PRESET) return { enabled: false, mode: DEFAULT_MODE };
		const current = this.get(agent);
		const target = MODES[(MODES.indexOf(current) + 1) % MODES.length];
		this.set(agent, target);
		return { enabled: true, mode: target };
	}
};
//#endregion
// 对外导出常量、纯函数和 Host 服务；`default` 兼容 Cordis 的默认服务加载方式。
export { APB_PRESET, DEFAULT_MODE, MODES, MODE_PERMISSION, ApbModeController, ApbModeController as default, foldPreset, modeContext, syncPermission };
