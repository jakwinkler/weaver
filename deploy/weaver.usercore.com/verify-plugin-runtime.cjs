const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../plugins');
let checked = 0;
for (const dir of fs.readdirSync(root)) {
  const location = path.join(root, dir);
  const manifestFile = path.join(location, 'weaver-plugin.json');
  if (!fs.existsSync(manifestFile)) continue;
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  if (manifest.entrypoints.server) {
    const entry = path.join(location, manifest.entrypoints.server.replace('src/server/', 'dist/server/').replace(/\.ts$/, '.js'));
    assert(fs.existsSync(entry), `Missing production server bundle: ${manifest.id}`);
    require(entry);
    const serverDir = path.dirname(entry);
    const exports = Object.assign({}, ...fs.readdirSync(serverDir)
      .filter(name => name === 'handlers.js' || name.endsWith('.handler.js'))
      .map(name => require(path.join(serverDir, name))));
    for (const route of manifest.routes ?? []) {
      assert.equal(typeof exports[route.handler], 'function', `Missing production handler: ${manifest.id}:${route.handler}`);
    }
    if (manifest.companion?.authenticator) assert.equal(typeof exports[manifest.companion.authenticator], 'function');
  }
  if (manifest.entrypoints.client) assert(fs.existsSync(path.join(location, 'dist/client/remoteEntry.js')), `Missing client bundle: ${manifest.id}`);
  if (manifest.id === '@weaver/plugin-automatic-time') {
    const federation = JSON.parse(fs.readFileSync(path.join(location, 'dist/client/mf-manifest.json'), 'utf8'));
    assert(federation.shared.some(dependency => dependency.name === 'react-router-dom' && dependency.singleton), 'Automatic Time must share the host router context');
  }
  checked++;
}
console.log(`Verified production bundles and route handlers for ${checked} plugins`);
