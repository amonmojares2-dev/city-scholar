// Dump every route registered on the Express app: METHOD /path (mount + route).
process.chdir(__dirname);
require("dotenv").config();
const app = require("./server").app;

const found = [];
function walk(stack, prefix) {
    for (const layer of stack) {
        if (layer.route) {
            const methods = Object.keys(layer.route.methods).filter((m) => layer.route.methods[m]);
            for (const m of methods) found.push(`${m.toUpperCase()} ${prefix}${layer.route.path}`);
            continue;
        }
        if (!layer.name) continue;
        if (layer.handle?.stack) {
            let mount = prefix;
            if (layer.regexp && layer.regexp.source && layer.regexp.source !== "^\\/?(?=\\/|$)") {
                mount = prefix + layer.regexp.source
                    .replace("^\\/", "/")
                    .replace("\\/?(?=\\/|$)", "")
                    .replace(/\\\//g, "/")
                    .replace(/\$$/, "");
            }
            walk(layer.handle.stack, mount);
        }
    }
}
walk((app.router || app._router).stack, "");
found.sort();
for (const r of found) console.log(r);
console.log(`total routes: ${found.length}`);
