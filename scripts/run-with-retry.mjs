import { spawnSync } from 'node:child_process';

const rootDir = new URL('../', import.meta.url);

function sleepSync(ms) {
	Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * `changeset publish` fires one concurrent npm publish per package via its own OIDC token
 * exchange; under load npm intermittently answers a subset with a 404 instead of a rate-limit
 * error. Already-published versions are skipped on the next run, so retrying the whole command
 * only re-attempts the ones a prior burst left unpublished.
 *
 * @param {string} command
 * @param {string[]} args
 * @param {{ attempts?: number, delayMs?: number }} [options]
 * @returns {void}
 */
export function runPublishWithRetry(command, args, { attempts = 3, delayMs = 20_000 } = {}) {
	for (let attempt = 1; attempt <= attempts; attempt++) {
		const { status, error } = spawnSync(command, args, { cwd: rootDir, stdio: 'inherit', shell: process.platform === 'win32' });
		if (error) throw error;
		if (status === 0) return;
		if (attempt === attempts) process.exit(status ?? 1);
		console.log(`\`${command} ${args.join(' ')}\` failed (attempt ${attempt}/${attempts}), retrying in ${delayMs}ms...`);
		sleepSync(delayMs);
	}
}
