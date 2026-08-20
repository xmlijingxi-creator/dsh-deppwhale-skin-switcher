/**
 * dsh-skin-switcher — host half.
 *
 * Exposes GET /skin-switcher (status) and POST /skin-switcher {target} on the
 * dsh web server. A switch rewrites BOTH patch layers (profile layer +
 * home layer) with skin mutual-exclusion rows; the loader's patch HMR
 * (watchUserPatches) re-composes the tree within ~1s, so switching is hot —
 * no restart required. `default` disables every skin (official theme).
 *
 * Declares `inject: ["webServer", "loader"]` so the cordis loader wires the
 * two services into `ctx` before calling `apply` — without the declaration,
 * `ctx.webServer` throws "cannot get property ... without inject".
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Stable cordis plugin name. */
const name = 'skin-switcher';
/** Required services: the HTTP route registry and the loader entry tree. */
const inject = ['webServer', 'loader'];

/** Every installed skin package, from the live loader entries (name + wiring id). */
function skinEntries(ctx) {
	const out = [];
	for (const entry of ctx.loader.entries()) {
		const entryName = entry.options?.name;
		const id = entry.options?.id;
		if (typeof entryName === 'string' && entryName.includes('dsh-client-ui-skin') && typeof id === 'string') {
			out.push({ id, name: entryName });
		}
	}
	return out.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * The profile directory. `ctx.baseUrl` is a `file://` URL of it, set by
 * dsh-app-boot; fall back to $DSH_HOME/profiles/web when it is unavailable.
 */
function resolveProfileDir(ctx) {
	const base = ctx.baseUrl;
	if (typeof base === 'string') {
		if (base.startsWith('file:')) return fileURLToPath(base);
		if (base !== '') return base;
	}
	if (base instanceof URL) return fileURLToPath(base);
	const dshHome = process.env.DSH_HOME || join(homedir(), '.dsh');
	return join(dshHome, 'profiles', 'web');
}

function homePatchPath() {
	const dshHome = process.env.DSH_HOME || join(homedir(), '.dsh');
	return join(dshHome, 'cordis.patch.yml');
}

/** Rewrite one patch layer: exactly one skin enabled, or none for default. */
function writePatchLayer(file, skins, activeId) {
	const lines = [
		'# dsh web skin mutual exclusion — written by dsh-skin-switcher',
		`# active skin: ${activeId ?? 'default (no skin)'}`,
		'',
	];
	for (const skin of skins) {
		lines.push(`- id: ${skin.id}`);
		lines.push(`  disabled: ${skin.id === activeId ? 'false' : 'true'}`);
	}
	const dir = dirname(file);
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
	writeFileSync(file, lines.join('\n') + '\n', 'utf8');
}

/** Which skin id the profile layer currently force-enables, if any. */
function readActiveId(file, skins) {
	try {
		const text = readFileSync(file, 'utf8');
		for (const skin of skins) {
			if (new RegExp(`- id: ${skin.id}\\s*\\n\\s*disabled: false`).test(text)) return skin.id;
		}
	} catch {
		/* missing file — nothing active */
	}
	return null;
}

function readJsonBody(req) {
	return new Promise((resolve, reject) => {
		let data = '';
		req.on('data', (chunk) => {
			data += chunk;
			if (data.length > 1e6) {
				reject(new Error('body too large'));
				req.destroy();
			}
		});
		req.on('end', () => {
			if (data === '') return resolve({});
			try {
				resolve(JSON.parse(data));
			} catch (error) {
				reject(error);
			}
		});
		req.on('error', reject);
	});
}

function sendJson(res, status, payload) {
	const body = JSON.stringify(payload);
	res.writeHead(status, {
		'content-type': 'application/json; charset=utf-8',
		'cache-control': 'no-store',
	});
	res.end(body);
}

function apply(ctx) {
	const profileDir = resolveProfileDir(ctx);
	const profilePatch = join(profileDir, 'cordis.patch.yml');
	const homePatch = homePatchPath();

	const handler = async (req, res) => {
		if (req.method === 'GET') {
			const skins = skinEntries(ctx);
			sendJson(res, 200, {
				ok: true,
				skins: skins.map((s) => s.id),
				active: readActiveId(profilePatch, skins),
			});
			return;
		}
		if (req.method !== 'POST') {
			res.writeHead(405, { allow: 'GET, POST' });
			res.end();
			return;
		}
		try {
			const body = await readJsonBody(req);
			const requested = typeof body.target === 'string' ? body.target.trim() : '';
			const skins = skinEntries(ctx);
			if (skins.length === 0) {
				sendJson(res, 500, { ok: false, error: 'no skins found in the loader entries' });
				return;
			}
			if (requested === 'default' || requested === 'none' || requested === '') {
				writePatchLayer(profilePatch, skins, null);
				writePatchLayer(homePatch, skins, null);
				sendJson(res, 200, { ok: true, active: null });
				return;
			}
			const target = skins.find(
				(s) => s.id === requested || s.name === requested || s.id.includes(requested) || s.name.includes(requested),
			);
			if (target === undefined) {
				sendJson(res, 400, {
					ok: false,
					error: `unknown skin: ${requested}`,
					available: skins.map((s) => s.id),
				});
				return;
			}
			writePatchLayer(profilePatch, skins, target.id);
			writePatchLayer(homePatch, skins, target.id);
			sendJson(res, 200, { ok: true, active: target.id });
		} catch (error) {
			sendJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
		}
	};

	ctx.effect(
		() => ctx.webServer.register({ kind: 'exact', path: '/skin-switcher', handler }),
		'skin-switcher: route',
	);
}

export { apply, inject, name };
