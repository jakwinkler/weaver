import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import request from 'supertest';
import { PluginAssetsController } from '../src/plugins/plugin-assets.controller';
import { PluginLoaderService } from '../src/plugins/plugin-loader.service';

class TestPluginLoaderService extends PluginLoaderService {
  async onModuleInit(): Promise<void> {}
}

describe('Dynamic plugin assets (e2e)', () => {
  let app: INestApplication;
  let pluginsDir: string;
  let loader: PluginLoaderService;

  beforeAll(async () => {
    pluginsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weaver-plugin-assets-'));
    const pluginDir = path.join(pluginsDir, 'plugin-example');
    fs.mkdirSync(path.join(pluginDir, 'dist/client'), { recursive: true });
    fs.writeFileSync(
      path.join(pluginDir, 'weaver-plugin.json'),
      JSON.stringify({
        id: '@example/plugin',
        name: 'Example',
        version: '1.0.0',
        entrypoints: { client: 'src/client/index.ts' },
        permissions: [],
      }),
    );
    fs.writeFileSync(
      path.join(pluginDir, 'dist/client/remoteEntry.js'),
      'export const plugin = true;',
    );

    loader = new TestPluginLoaderService();
    await loader.loadPlugins(pluginsDir);
    const module = await Test.createTestingModule({
      controllers: [PluginAssetsController],
      providers: [{ provide: PluginLoaderService, useValue: loader }],
    }).compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    fs.rmSync(pluginsDir, { recursive: true, force: true });
  });

  it('serves a compiled remote entry as JavaScript', async () => {
    expect(loader.resolveClientAsset('@example/plugin/remoteEntry.js')).toBe(
      path.join(pluginsDir, 'plugin-example/dist/client/remoteEntry.js'),
    );

    const response = await request(app.getHttpServer())
      .get('/api/v1/plugin-assets/@example/plugin/remoteEntry.js')
      .expect(200)
      .expect('Cache-Control', 'no-cache')
      .expect('Content-Type', /javascript/);

    expect(response.text).toContain('export const plugin = true');
  });

  it('does not expose missing files or files outside dist/client', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/plugin-assets/@example/plugin/not-found.js')
      .expect(404);
    await request(app.getHttpServer())
      .get('/api/v1/plugin-assets/@example/plugin/%2E%2E/weaver-plugin.json')
      .expect(404);
  });
});
