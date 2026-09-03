// @deepseek-ai/dsh-client-ui-apb-mode — host half.
//
// Pure UI plugin. The empty apply exists so the plugin appears in the host
// cordis.yml / Loader; the browser half ships via exports["./client"],
// discovered through the package.json dsh.client declaration. APB mode
// behavior itself (the /apb command, the apbMode projection unit, the policy
// section, permission linkage) is owned by `@deepseek-ai/dsh-apb-mode`,
// composed on the agent preset plane.

/** Host plugin body — no host-side behavior for this surface plugin. */
function apply() {}

export { apply };
