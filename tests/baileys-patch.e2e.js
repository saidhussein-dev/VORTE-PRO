// The Baileys patch that gives group-status media its `mediatype` must be applied (npm install runs patch-package).
const { check, section, done } = require("./_mock");
const { baileysPatched } = require("../src/utils/groupStatus");
const fs = require("fs");
const path = require("path");
section("Baileys patch");
check("patches/ contains the Baileys patch", fs.readdirSync(path.join(__dirname, "../patches")).some((f) => /^baileys\+.*\.patch$/.test(f)));
check("the patch is applied in node_modules", baileysPatched() === true);
check("package.json runs patch-package after install", /patch-package/.test(require("../package.json").scripts.postinstall || ""));
check("the Dockerfile copies patches/ before npm ci", /COPY patches[^\n]*\n(?:[^\n]*\n)?RUN npm ci/.test(fs.readFileSync(path.join(__dirname, "../Dockerfile"), "utf8")));
done();
