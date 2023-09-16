/**
 * This file exists only because I couldn't figure out how to inline macros.
 * This file only used by common.ts
 */

export function getVersion(): string {
	const { stdout } = Bun.spawnSync({
		cmd: ["git", "describe", "--tags"],
		stdout: "pipe",
	});

	return stdout.toString();
}
