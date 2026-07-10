const fs = require("fs");
const path = require("path");

const distDir = path.join(__dirname, "..", "dist");
fs.mkdirSync(distDir, { recursive: true });

const bootstrap = `const path = require("path");
const { pathToFileURL } = require("url");
require("tsx/cjs");

const backendEntry = path.resolve(__dirname, "../../backend/src/server.ts");
import(pathToFileURL(backendEntry).href);
`;

fs.writeFileSync(path.join(distDir, "server.cjs"), bootstrap);
