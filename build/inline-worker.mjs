import esbuild from "esbuild";

// Obsidian's community installer only fetches main.js, manifest.json and styles.css,
// so the analysis worker (wink-nlp + its ~4 MB model) is bundled first and inlined
// as a string, then started from a Blob URL at runtime.
export function inlineWorker({ minify }) {
	return {
		name: "inline-analysis-worker",
		setup(build) {
			build.onResolve({ filter: /^virtual:analysis-worker$/ }, (args) => ({ path: args.path, namespace: "inline-worker" }));
			build.onLoad({ filter: /.*/, namespace: "inline-worker" }, async () => {
				const result = await esbuild.build({
					entryPoints: ["src/worker/analysis.worker.ts"],
					bundle: true,
					format: "iife",
					target: "es2020",
					platform: "browser",
					minify,
					write: false,
				});
				return { contents: `export default ${JSON.stringify(result.outputFiles[0].text)};`, loader: "js" };
			});
		},
	};
}
