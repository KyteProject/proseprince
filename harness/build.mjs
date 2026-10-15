import esbuild from "esbuild";
import { inlineWorker } from "../build/inline-worker.mjs";

await esbuild.build({
	entryPoints: ["harness/harness.ts"],
	bundle: true,
	format: "iife",
	target: "es2020",
	platform: "browser",
	outfile: "harness/dist/harness.js",
	logLevel: "info",
	plugins: [inlineWorker({ minify: true })],
});
