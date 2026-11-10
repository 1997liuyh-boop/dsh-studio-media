// <define:STUDIO_PROJECT>
var define_STUDIO_PROJECT_default = { name: "AI\u77ED\u5267\u5DE5\u4F5C\u53F0", icon: "\u270D\uFE0F", description: "Toonflow \u539F\u5E94\u7528\uFF1A\u65E0\u9650\u753B\u5E03\u3001\u5267\u672C\u5206\u955C\u3001\u89D2\u8272\u7D20\u6750\u4E0E\u56FE\u7247\u89C6\u9891\u751F\u6210" };

// packages/sdk/entry.ts
import { fileURLToPath } from "node:url";
var name = "dsh-studio-media";
var inject = ["studioProjects"];
function apply(ctx) {
  ctx.effect(() => ctx.studioProjects.register({ id: "media", ...define_STUDIO_PROJECT_default, root: fileURLToPath(new URL("../static/", import.meta.url)) }), "\u5DE5\u4F5C\u5BA4\uFF1Amedia");
}
export {
  apply,
  inject,
  name
};
