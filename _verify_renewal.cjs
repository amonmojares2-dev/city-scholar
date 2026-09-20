const { execSync } = require("child_process");
const fs = require("fs");

let out = "";
const run = (cmd, cwd) => {
    try {
        out += `$ ${cmd}\n` + execSync(cmd, { cwd, timeout: 240000 }).toString() + "\n";
    } catch (e) {
        out += `$ ${cmd}\nFAILED:\n` + (e.stdout || "").toString() + (e.stderr || "").toString() + "\n";
    }
};

// 1. Server controllers must parse (catches duplicate-declaration crashes).
run('node -e "require(\'./controllers/studentDocController.js\');require(\'./controllers/documentController.js\');require(\'./models/Document.js\');console.log(\'SERVER_CONTROLLERS_OK\')"',
    "c:/Users/amonm/city-scholar/server");
// 2. Client type-check.
run("node node_modules/typescript/bin/tsc --noEmit", "c:/Users/amonm/city-scholar/client");
// 3. Client production build.
run("node node_modules/vite/bin/vite.js build", "c:/Users/amonm/city-scholar/client");

fs.writeFileSync("c:/Users/amonm/city-scholar/_verify_renewal.out", out);
console.log(out.slice(-3000));
