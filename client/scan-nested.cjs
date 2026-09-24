// TEMP diagnostic: find component definitions nested inside another component
// (i.e. indented to brace-depth >= 2 in a module that has a top-level
// component). Those are recreated on every render and remount their subtree,
// which is the classic "input loses focus after one character" bug.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "src");
const COMPONENT_DEF = /^\s*(?:export\s+)?(?:default\s+)?function\s+([A-Z]\w*)\s*\(|^\s*const\s+([A-Z]\w*)\s*=\s*(?:\(|React\.memo|memo|forwardRef)/;
const HOOKISH = /^\s*(?:const|let)\s+[A-Z]\w*\s*=\s*use[A-Z]/;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      walk(full, out);
    } else if (/\.tsx$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const findings = [];

for (const file of walk(ROOT)) {
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  let depth = 0;
  let inBlockComment = false;
  let inTemplate = false;

  lines.forEach((raw, index) => {
    const lineNo = index + 1;
    const trimmed = raw.trim();

    // Crude comment / template guard so string braces don't skew depth.
    if (inBlockComment) {
      if (trimmed.includes("*/")) inBlockComment = false;
      return;
    }
    if (trimmed.startsWith("/*")) {
      if (!trimmed.includes("*/")) inBlockComment = true;
      return;
    }
    if (trimmed.startsWith("//")) return;

    const depthBefore = depth;

    if (!inTemplate) {
      for (const ch of raw) {
        if (ch === "{") depth++;
        else if (ch === "}") depth--;
        else if (ch === "`") inTemplate = !inTemplate;
      }
    }

    // A definition that starts while we are already inside a function body.
    if (depthBefore >= 1 && COMPONENT_DEF.test(raw) && !HOOKISH.test(raw)) {
      const name = (raw.match(COMPONENT_DEF) || []).slice(1).find(Boolean);
      findings.push({
        file: path.relative(path.join(__dirname, ".."), file),
        lineNo,
        depth: depthBefore,
        name,
        text: trimmed.slice(0, 88),
      });
    }
  });
}

console.log(`NESTED COMPONENT CANDIDATES: ${findings.length}\n`);
for (const f of findings) {
  console.log(`${f.file}:${f.lineNo}  depth=${f.depth}  <${f.name}>`);
  console.log(`    ${f.text}`);
}
