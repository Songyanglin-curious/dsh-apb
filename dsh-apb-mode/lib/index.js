// @deepseek-ai/dsh-apb-mode
//
// APB (Ask / Plan / Build) tri-mode session state for the apb-coding preset.
//
// Design:
// - The mode is LOGGED per session (`apb/mode` events, last one wins,
//   default `ask`), so resume and fork restore it without a live mirror.
// - Switching mode through `/apb` (or a future client hotkey that executes
//   that command) also writes the matching HOST permission preset through
//   `permissionPresets`: ask/plan -> `read-only`, build -> `workspace-write`.
//   That is real enforcement by the file sandbox / approval knobs, not a
//   prompt-level "please behave read-only" rule.
// - The prompt section stays tiny: empty in `ask` (the default, no noise),
//   one short line in `plan` and `build`. The persona carries the full
//   mode semantics; this package only narrates the current state.
// - A session projection `apbMode` exposes `{ enabled, mode }` to client UI:
//   `enabled` folds the session's own `agent-preset/selected` event, so the
//   chip appears only on sessions running the apb-coding preset.

import { Service } from "@deepseek-ai/cordis";
import { z } from "zod";

/** The three modes in cycle order. */
const MODES = ["ask", "plan", "build"];
/** Default mode for a session that never logged one. */
const DEFAULT_MODE = "ask";
/** The apb-coding preset id this plugin serves. */
const APB_PRESET = "apb-coding";
/** Mode -> host permission preset. */
const MODE_PERMISSION = {
	ask: "read-only",
	plan: "read-only",
	build: "workspace-write"
};

/** Fold the last logged mode (default ask). */
function foldMode(events) {
	let mode = DEFAULT_MODE;
	for (const event of events) {
		if (event.type === "apb/mode" && MODES.includes(event.data.mode)) mode = event.data.mode;
	}
	return mode;
}

/** Fold the session's own agent-preset selection (undefined before one). */
function foldPreset(events) {
	let preset;
	for (const event of events) {
		if (event.type === "agent-preset/selected" && typeof event.data?.agentPreset === "string") preset = event.data.agentPreset;
	}
	return preset;
}

/** One-line prompt guidance per mode; ask stays empty (default, no noise). */
function modeSection(mode) {
	switch (mode) {
		case "plan":
			return "[APB] plan mode: from the ask dialogue above, produce the implementation plan (read-only) and wait for confirmation — do not implement yet.";
		case "build":
			return "[APB] build mode: execute the confirmed dialogue or plan; writes are allowed.";
		default:
			return "";
	}
}

/**
 * `ctx.apbMode`: owns the logged per-session APB mode, applies the matching
 * host permission preset on every switch, registers the tiny mode section,
 * the `apbMode` projection, and the `/apb` command. UIs observe committed
 * state through the projection; there is no live mirror.
 */
var ApbModeController = class extends Service {
	static inject = ["systemPrompt"];
	constructor(ctx) {
		super(ctx, "apbMode");
		ctx.systemPrompt.section({
			name: "apb:policy",
			order: 90,
			text: (context) => {
				if (context.agent === void 0) return "";
				return modeSection(foldMode(context.agent.session.events));
			}
		});
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
		ctx.inject(["commands"], (commandCtx) => {
			commandCtx.commands.register({
				name: "apb",
				description: "Switch the APB mode (ask/plan/build) and the matching permission preset",
				input: { hint: "[ask|plan|build|next|status]" },
				handler: ({ agent, rawInput }) => {
					const arg = rawInput.trim();
					const current = foldMode(agent.session.events);
					if (arg === "" || arg === "status") {
						return {
							kind: "success",
							text: `APB mode: ${current} (permission preset: ${MODE_PERMISSION[current]})`
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
							text: `unknown APB mode "${arg}" (available: ${MODES.join(", ")} | next | status)`
						};
					}
					if (target === current) {
						return {
							kind: "success",
							text: `APB mode is already ${current}.`
						};
					}
					const session = agent.session;
					session.append("apb/mode", { mode: target });
					const permission = ctx.get("permissionPresets");
					if (permission !== void 0) {
						permission.set(session, MODE_PERMISSION[target]);
					}
					return {
						kind: "success",
						text: `APB mode: ${current} -> ${target} (permission preset: ${MODE_PERMISSION[target]}).`
					};
				}
			});
		});
	}
	/**
	 * Read the logged mode for one agent.
	 * @param agent The agent to read.
	 * @returns The folded mode.
	 */
	get(agent) {
		return foldMode(agent.session.events);
	}
	/**
	 * Select a mode for one agent immediately (command equivalent).
	 * @param agent The agent to switch.
	 * @param mode `ask` | `plan` | `build`.
	 * @returns The mode now in force.
	 */
	set(agent, mode) {
		if (!MODES.includes(mode)) throw new Error(`unknown APB mode "${mode}" (available: ${MODES.join(", ")})`);
		const session = agent.session;
		const current = foldMode(session.events);
		if (mode !== current) {
			session.append("apb/mode", { mode });
			const permission = this.ctx.get("permissionPresets");
			if (permission !== void 0) permission.set(session, MODE_PERMISSION[mode]);
		}
		return mode;
	}
};
//#endregion
export { APB_PRESET, DEFAULT_MODE, MODES, MODE_PERMISSION, ApbModeController, ApbModeController as default, foldMode, modeSection };
