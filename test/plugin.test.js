import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

test('package.json 配置检查', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  assert.equal(pkg.name, 'dsh-hotspot');
  assert.equal(pkg.exports['./client'], './src/client.js');
  assert.ok(pkg.dsh, 'dsh 配置应存在');
  assert.ok(pkg.dsh.client, 'dsh.client 应存在');
  assert.equal(pkg.dsh.client.platform, 'web');
  assert.equal(pkg.dsh.client.immediately, true);
  assert.ok(pkg.files.includes('icon.svg'));
  assert.ok(pkg.files.includes('locale'));
});

test('元数据资源完整性', () => {
  assert.ok(existsSync('icon.svg'), 'icon.svg 应存在');
  const svg = readFileSync('icon.svg', 'utf8');
  assert.ok(svg.includes('<svg') && svg.includes('</svg>'), 'icon.svg 应当是标准 svg');

  assert.ok(existsSync('locale/zh.json'), 'locale/zh.json 应存在');
  assert.ok(existsSync('locale/en.json'), 'locale/en.json 应存在');
  const zh = JSON.parse(readFileSync('locale/zh.json', 'utf8'));
  const en = JSON.parse(readFileSync('locale/en.json', 'utf8'));
  assert.ok(zh['dsh.plugin.dsh-hotspot.name'] || zh['dsh.plugin.hotspot.name'], '中文名称字段应存在');
  assert.ok(en['dsh.plugin.dsh-hotspot.name'] || en['dsh.plugin.hotspot.name'], '英文名称字段应存在');
});

test('客户端脚本 src/client.js 语法及注册契约', () => {
  assert.ok(existsSync('src/client.js'), 'src/client.js 应存在');
  const code = readFileSync('src/client.js', 'utf8');
  assert.ok(code.includes('window.__ModuleLoader__.load'), '需调用 __ModuleLoader__.load');
  assert.ok(code.includes("id: 'dsh-hotspot'"), '模块 id 需为 dsh-hotspot');
  assert.ok(code.includes('sidebar.panellist'), '必须注入 sidebar.panellist 槽位');
  assert.ok(code.includes("'main'"), '必须注入 main 槽位');
  assert.ok(code.includes('--dsw-alias-'), '需使用 DSH 原生主题变量');

  // 模拟 ModuleLoader 执行验证闭包
  let registeredModule = null;
  const mockWindow = {
    __ModuleLoader__: {
      load: (mod) => {
        registeredModule = mod;
      }
    }
  };

  // 在沙盒中评估
  const runFn = new Function('window', code);
  runFn(mockWindow);

  assert.ok(registeredModule, '模块应被注册');
  assert.equal(registeredModule.id, 'dsh-hotspot');
  assert.equal(typeof registeredModule.factory, 'function');

  // 测试 factory 执行与 ctx slots 注入
  const fakeReact = {
    createElement: (type, props, children) => ({ type, props, children }),
    useState: (init) => [init, () => {}],
    useEffect: () => {},
    useCallback: (fn) => fn
  };
  const mockRequire = (name) => {
    if (name === 'react') return fakeReact;
    throw new Error('Unexpected require: ' + name);
  };

  const exports = registeredModule.factory(mockRequire);
  assert.ok(exports.inject.includes('slots'));
  assert.ok(exports.inject.includes('layout'));
  assert.equal(typeof exports.apply, 'function');

  const injectedSlots = [];
  const registeredSlots = [];
  const mockCtx = {
    slots: {
      inject: (slotName, fn) => {
        injectedSlots.push(slotName);
        return fn();
      },
      register: (meta, component) => {
        registeredSlots.push({ meta, component });
      }
    },
    get: (svc) => ({ selectPanel: () => {} })
  };

  exports.apply(mockCtx);
  assert.ok(injectedSlots.includes('sidebar.panellist'), '应当注入 sidebar.panellist');
  assert.ok(injectedSlots.includes('main'), '应当注入 main');
  assert.equal(registeredSlots.length, 2);
  const sidebarSlot = registeredSlots.find(s => s.meta.name === 'sidebar.panellist');
  const mainSlot = registeredSlots.find(s => s.meta.name === 'main');
  assert.equal(sidebarSlot.meta.id, 'dsh-hotspot');
  assert.equal(mainSlot.meta.key, 'dsh-hotspot');
});
