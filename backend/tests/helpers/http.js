import { createTestSandbox, freshImport, resetMockEnv } from './test-env.js';

export function createRouteTestContext(name, configPatch = {}) {
  const sandbox = createTestSandbox(name, configPatch);
  sandbox.setEnv();
  let server = null;

  return {
    sandbox,
    async ensureServer() {
      if (server) return server;
      const { createApp } = await freshImport('backend/server.js');
      server = createApp().listen(0, '127.0.0.1');
      await new Promise((resolve) => server.once('listening', resolve));
      return server;
    },
    async request(path, init = {}) {
      const appServer = await this.ensureServer();
      return fetch(`http://127.0.0.1:${appServer.address().port}${path}`, init);
    },
    async close() {
      resetMockEnv();
      if (server) {
        await new Promise((resolve, reject) => {
          server.close((err) => (err ? reject(err) : resolve()));
        });
      }
      sandbox.cleanup();
    },
  };
}
