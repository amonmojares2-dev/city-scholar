const fs = require("fs");
const p = require("path");

const SKIP_BASENAMES = new Set([
    "verify-startup.js",
    "_smoke.js",
    "_scan.js",
    "_require_scan.js",
    "_map.txt",
    "_idx.txt",
    "_uc_cur.txt",
    "_lp.txt",
    "_lp2.txt",
    "_lp3.txt",
    "_l.txt",
    "_anchors.txt",
    "f1.txt",
    "_smoke.txt",
    "_final.txt",
    "_final.ps1",
    "_q1.txt",
    "_a.txt",
    "_L.txt",
    "_m.txt",
    "lp-skel.txt",
    "lp-skel2.txt",
    "lp2.txt",
    "lp3.txt",
    "lp.txt",
    "lp1.txt",
]);

const dir = "c:/Users/amonm/city-scholar/server";
const skipDirs = new Set(["node_modules", ".git", "uploads"]);

const results = [];
let pass = 0;
let fail = 0;

function tryRequire(file) {
    const rel = p.relative(dir, file).split("\\").join("/");
    const modulePath = "./" + rel.replace(/\.js$/, "");
    try {
        require(modulePath);
        pass++;
        results.push("OK " + rel);
    } catch (e) {
        fail++;
        results.push("FAIL " + rel + " :: " + e.message);
    }
}

function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (skipDirs.has(e.name)) continue;
        const f = p.join(d, e.name);
        if (e.isDirectory()) {
            walk(f);
        } else if (f.endsWith(".js") && !SKIP_BASENAMES.has(p.basename(f))) {
            tryRequire(f);
        }
    }
}

walk(dir);

results.unshift(JSON.stringify({ pass, fail }));
fs.writeFileSync("_require_scan.log", results.join("\n") + "\n");
process.exitCode = fail ? 1 : 0;
