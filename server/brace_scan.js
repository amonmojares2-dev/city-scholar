const s = require("fs").readFileSync("tests/sessionCookie.test.js", "utf8");
const lines = s.split(/\r?\n/);
let d = 0;
lines.forEach((l, i) => {
    for (const c of l) {
        if (c === "{") d++;
        if (c === "}") d--;
    }
    if (/^\s*(describe|\}\);|\}\)\;)/.test(l)) {
        console.log(String(i + 1).padStart(3), "depth=" + d, l.slice(0, 70));
    }
});
console.log("FINAL depth", d);
