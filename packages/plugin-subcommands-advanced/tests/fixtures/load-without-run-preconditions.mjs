// Imports the built entries given as arguments against a framework that has no `runPreconditions`, and prints
// `loaded` once every entry has linked and run.
import { register } from "node:module";

register("./without-run-preconditions.hooks.mjs", import.meta.url);

const framework = await import("@wolfstar/http-framework");
if ("runPreconditions" in framework) throw new Error("The shim still exports runPreconditions.");

for (const entry of process.argv.slice(2)) await import(entry);
console.log("loaded");
