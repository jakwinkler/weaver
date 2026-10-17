// Both API Jest configs map `supertest` to this file, so load the package by path.
const supertest = require('supertest/index.js');

// Given an unbound server, supertest listens on every interface and then sends the request
// to 127.0.0.1. On macOS that port can already belong to another process listening on
// 127.0.0.1 only, such as a Docker port forward or Tailscale, and that process receives the
// request. A server bound to 127.0.0.1 cannot share its port with another loopback listener.
function assertLoopback(app) {
  if (typeof app !== 'string' && app?.address?.()?.address !== '127.0.0.1') {
    throw new Error(
      "Bind the app to loopback before sending requests: await app.listen(0, '127.0.0.1')",
    );
  }
}

function request(app, options) {
  assertLoopback(app);
  return supertest(app, options);
}

// An agent may be created without an app and given absolute URLs instead.
function agent(app, options) {
  if (app != null) assertLoopback(app);
  return supertest.agent(app, options);
}

module.exports = Object.assign(request, supertest, { agent });
