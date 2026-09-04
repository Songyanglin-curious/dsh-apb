/* Hand-written Typert host artifact for the APB Remote boundary. */
import { z } from "zod";

const sessionIdSchema = z.string().min(1);
const apbStateSchema = z.object({
	enabled: z.boolean().readonly(),
	mode: z.union([z.literal("ask"), z.literal("plan"), z.literal("build")]).readonly()
});

const invocation = (method, implementation) => ({
	id: `@deepseek-ai/dsh-apb#apbMode/${method}`,
	service: "apbMode",
	namespace: "apbMode",
	method,
	implementation,
	invocation: { kind: "direct" },
	scope: {
		context: "agent",
		wire: "agentId"
	},
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
});

/**
 * Static Host contribution loaded by DSH's Typert Loader.
 * It deliberately carries no decorator state, so repository links and installed
 * profiles may load separate dsh-typert-protocol module instances safely.
 */
export const TYPERT = {
	package: "@deepseek-ai/dsh-apb",
	face: "host",
	schemas: [],
	invocations: [
		invocation("get", "remoteGet"),
		invocation("cycle", "remoteCycle")
	],
	model: {
		services: [],
		events: [],
		objects: []
	}
};

export default TYPERT;
