// Temporary smoke test: proves POST /api/auth/login is routed and the
// controller executes for any email (single unified sign-in endpoint).
const express = require("express");
const http = require("http");

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use("/api/auth", require("./routes/authRoutes"));
app.use((err, req, res, next) => res.status(500).json({ message: err.message }));
const server = app.listen(5199);

function post(path, body) {
    return new Promise((resolve) => {
        const payload = JSON.stringify(body);
        const req = http.request(
            { host: "localhost", port: 5199, path, method: "POST",
              headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } },
            (res) => {
                let data = "";
                res.on("data", (c) => (data += c));
                res.on("end", () => resolve(`${path} -> ${res.statusCode} ${data.slice(0, 120)}`));
            }
        );
        req.on("error", (e) => resolve(`${path} -> ERR ${e.message}`));
        req.write(payload);
        req.end();
    });
}

(async () => {
    const results = [];
    results.push(await post("/api/auth/login", { email: "not-an-email", password: "x" }));
    results.push(await post("/api/auth/login", { email: "someone@gmail.com", password: "Password1!" }));
    results.push(await post("/api/auth/set-password", { challengeId: "000000000000000000000000", newPassword: "Password1!", confirmNewPassword: "Password1!" }));
    console.log(results.join("\n"));
    server.close();
    process.exit(0);
})();
