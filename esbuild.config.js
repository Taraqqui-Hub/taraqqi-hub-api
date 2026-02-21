import * as esbuild from "esbuild";
import { readdirSync } from "fs";
import { join } from "path";

// Externalize node_modules so native deps (pg, bcrypt, etc.) work at runtime
const nodeModules = new Set(
  readdirSync(join(process.cwd(), "node_modules")).filter(
    (name) => !name.startsWith(".")
  )
);

await esbuild.build({
  entryPoints: ["src/server/index.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: "dist/server.js",
  sourcemap: true,
  external: [...nodeModules],
  target: "node20",
});

console.log("Built dist/server.js");
