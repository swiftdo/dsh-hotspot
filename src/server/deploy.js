import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

/**
 * 站点部署：执行配置里的 build → script，截留输出，记最近若干次历史。
 *
 * 单独成文件的理由：这是唯一会「执行用户命令」的地方，混在路由表里既不好审，
 * 也容易让人以为部署逻辑和热点采集有什么关系。
 *
 * 用「用户登录 shell」而不是 /bin/sh -c：面板跑在 DSH 进程里，GUI 从 Finder
 * 启动时 PATH 只有 launchd 的最小集合，yarn / nvm / corepack / ssh-agent 都
 * 不在里面。用 -l 让登录 shell 重新加载用户的 PATH，与终端行为对齐。
 */

// 站点部署：命令来自项目配置的 deploy 段（build 可选、script 必填），
// 在博客根目录下用「用户登录 shell」执行。
//
// 为什么不用 /bin/sh -c：面板跑在 DSH 进程里，GUI 从 Finder 启动时 PATH 只有
// launchd 的最小集合，yarn / nvm / corepack / ssh-agent 都不在里面。用户在终端
// 里能跑通的部署脚本，面板一点就 command not found —— 这是「部署逻辑没打通」
// 最常见的原因。用 -l 让登录 shell 重新加载用户的 PATH，与终端行为对齐。
export const DEPLOY_TIMEOUT_MS = 10 * 60 * 1000;
const DEPLOY_OUTPUT_LIMIT = 64 * 1024;
const DEPLOY_HISTORY_LIMIT = 10;

function tail(text, limit = DEPLOY_OUTPUT_LIMIT) {
  if (text.length <= limit) return text;
  return `…（输出超过 ${limit} 字符，已保留末尾）\n${text.slice(-limit)}`;
}

/** 优先用用户的登录 shell；找不到就退回 /bin/sh。 */
export function resolveLoginShell() {
  for (const candidate of [process.env.SHELL, '/bin/zsh', '/bin/bash', '/bin/sh']) {
    if (typeof candidate === 'string' && candidate.startsWith('/') && existsSync(candidate)) {
      return candidate;
    }
  }
  return '/bin/sh';
}

/**
 * 执行单条命令，永不 reject：失败也把 stdout/stderr/退出码交回给调用方。
 *
 * `onChunk({ stream, text })` 会在每段输出到达时同步回调：面板的实时日志靠它，
 * 而不是等进程退出才拿到整段 —— 那几分钟正是用户最需要看见的时候。
 *
 * @param {string} script
 * @param {string} cwd
 * @param {{ timeoutMs?: number, onChunk?: (chunk: { stream: 'stdout'|'stderr', text: string }) => void }} [options]
 * @returns {Promise<{ success: boolean, code: number|null, signal: string|null, stdout: string, stderr: string, durationMs: number, timedOut: boolean }>}
 */
export function runDeployScript(script, cwd, options = {}) {
  const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : DEPLOY_TIMEOUT_MS;
  return new Promise((resolve) => {
    const startedAt = Date.now();
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;
    let timer = null;

    const finish = (code, signal, error) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve({
        success: !timedOut && !error && code === 0,
        code,
        signal: signal ?? null,
        stdout: tail(stdout),
        stderr: tail(stderr),
        durationMs: Date.now() - startedAt,
        timedOut,
      });
    };

    let child;
    try {
      child = spawn(resolveLoginShell(), ['-l', '-c', script], {
        cwd,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      stderr = error.message;
      finish(null, null, error);
      return;
    }

    timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill('SIGKILL');
      } catch {
        /* 进程可能已经退出 */
      }
    }, timeoutMs);

    const onChunk = typeof options.onChunk === 'function' ? options.onChunk : null;

    child.stdout?.on('data', (chunk) => {
      const text = chunk.toString('utf8');
      stdout += text;
      if (stdout.length > DEPLOY_OUTPUT_LIMIT * 2) stdout = stdout.slice(-DEPLOY_OUTPUT_LIMIT);
      if (onChunk) onChunk({ stream: 'stdout', text });
    });
    child.stderr?.on('data', (chunk) => {
      const text = chunk.toString('utf8');
      stderr += text;
      if (stderr.length > DEPLOY_OUTPUT_LIMIT * 2) stderr = stderr.slice(-DEPLOY_OUTPUT_LIMIT);
      if (onChunk) onChunk({ stream: 'stderr', text });
    });
    child.on('error', (error) => finish(null, null, error));
    child.on('close', (code, signal) => finish(code, signal));
  });
}

/**
 * 探测博客根目录里现成的部署入口，给面板一个「一键绑定」的建议值。
 * 只做只读判断，不改配置、不执行任何东西。
 */
export function detectDeployPlan(root) {
  const detected = { script: '', build: '' };
  if (!root || !existsSync(root)) return detected;

  for (const rel of ['deploy.sh', 'scripts/deploy.sh', 'bin/deploy.sh']) {
    if (existsSync(path.join(root, rel))) {
      detected.script = `./${rel}`;
      break;
    }
  }

  try {
    const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
    if (pkg?.scripts?.build) {
      if (existsSync(path.join(root, 'pnpm-lock.yaml'))) detected.build = 'pnpm run build';
      else if (existsSync(path.join(root, 'yarn.lock'))) detected.build = 'yarn build';
      else detected.build = 'npm run build';
    }
  } catch {
    /* 没有 package.json 就不是前端站点，留空即可 */
  }
  return detected;
}

/**
 * 把配置里的 deploy 段摊平成面板与接口共用的一份描述。
 * 未配置 timeoutMs 时用默认值，配置值不允许超过默认上限。
 */
export function describeDeploy(config, root) {
  const script = String(config?.deploy?.script ?? '').trim();
  const build = String(config?.deploy?.build ?? '').trim();
  const rawTimeout = Number(config?.deploy?.timeoutMs);
  const timeoutMs = Number.isFinite(rawTimeout) && rawTimeout > 0
    ? Math.min(Math.floor(rawTimeout), DEPLOY_TIMEOUT_MS)
    : DEPLOY_TIMEOUT_MS;
  return {
    script,
    build,
    timeoutMs,
    configured: Boolean(script),
    detected: detectDeployPlan(root),
  };
}

/**
 * 按 build → script 的顺序执行部署计划，任一步失败即停。
 * 顶层字段取「最后执行的那一步」，并额外带 steps，兼容旧的单脚本调用方。
 *
 * 可选 hooks（面板的实时日志用）：
 * - `onStep({ name, script?, state, code?, durationMs?, timedOut?, startedAt? })`
 * - `onChunk({ step, stream, text })`
 * 两个钩子都是「尽力而为」：回调抛错不能影响部署本身。
 */
export async function runDeployPlan(plan, cwd, hooks = {}) {
  const startedAt = Date.now();
  const steps = [];
  const onStep = typeof hooks.onStep === 'function' ? hooks.onStep : () => {};
  const onChunk = typeof hooks.onChunk === 'function' ? hooks.onChunk : null;

  const notify = (event) => {
    try {
      onStep(event);
    } catch {
      /* 进度是辅助信息，不能打断部署 */
    }
  };

  const runOne = async (name, script) => {
    notify({ name, script, state: 'running', startedAt: new Date().toISOString() });
    const result = await runDeployScript(script, cwd, {
      timeoutMs: plan.timeoutMs,
      onChunk: onChunk
        ? (chunk) => {
            try {
              onChunk({ step: name, ...chunk });
            } catch {
              /* 同上 */
            }
          }
        : undefined,
    });
    notify({
      name,
      state: result.success ? 'success' : 'failed',
      code: result.code,
      durationMs: result.durationMs,
      timedOut: result.timedOut,
    });
    steps.push({ name, script, ...result });
    return result;
  };

  if (plan.build) {
    const built = await runOne('build', plan.build);
    if (!built.success) {
      return { success: false, failedStep: 'build', steps, durationMs: Date.now() - startedAt };
    }
  }

  const deployed = await runOne('deploy', plan.script);
  return {
    success: deployed.success,
    failedStep: deployed.success ? null : 'deploy',
    steps,
    durationMs: Date.now() - startedAt,
  };
}

/**
 * 进程内的部署实时快照。
 *
 * 为什么不在 `runDeployPlan` 里直接攒：面板要能**在部署之外**读到进度
 * （关掉弹窗再打开、刷新页面、重开面板），所以状态必须活在一个比单次请求更长的
 * 地方。这里只存状态、不做 IO —— 落历史仍然是 api 那层的事。
 *
 * 边界：
 * - 同一时刻只有一个 current（并发由 api 的 ERR_DEPLOY_BUSY 挡）；
 * - 输出按「步骤内 stdout/stderr 到达顺序」拼成一段，超出上限只留末尾并标 truncated；
 * - 结束后快照保留，面板重开还能看上次。
 */
export function createDeployTracker({ limit = DEPLOY_OUTPUT_LIMIT, now = () => new Date() } = {}) {
  let current = null;
  let last = null;

  const snapshotOf = (run) => ({
    id: run.id,
    state: run.state,
    startedAt: run.startedAt,
    endedAt: run.endedAt,
    cwd: run.cwd,
    plan: { ...run.plan },
    truncated: run.truncated,
    steps: run.steps.map((step) => ({ ...step })),
  });

  return {
    begin({ cwd = '', plan = {} } = {}) {
      current = {
        id: `deploy-${now().getTime().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        state: 'running',
        startedAt: now().toISOString(),
        endedAt: '',
        cwd: String(cwd ?? ''),
        plan: { build: String(plan.build ?? ''), script: String(plan.script ?? '') },
        truncated: false,
        steps: [],
      };
      return snapshotOf(current);
    },

    step(event = {}) {
      if (!current) return null;
      const name = String(event.name ?? '');
      if (!name) return null;
      let step = current.steps.find((entry) => entry.name === name);
      if (!step) {
        step = {
          name,
          script: String(event.script ?? ''),
          state: 'running',
          startedAt: String(event.startedAt ?? now().toISOString()),
          endedAt: '',
          code: null,
          durationMs: 0,
          timedOut: false,
          output: '',
        };
        current.steps.push(step);
      }
      if (event.state === 'running') {
        step.state = 'running';
        if (event.startedAt) step.startedAt = String(event.startedAt);
        if (event.script) step.script = String(event.script);
      } else if (event.state === 'success' || event.state === 'failed') {
        step.state = event.state;
        step.endedAt = now().toISOString();
        if (event.code !== undefined) step.code = event.code;
        if (event.durationMs !== undefined) step.durationMs = Number(event.durationMs) || 0;
        if (event.timedOut !== undefined) step.timedOut = Boolean(event.timedOut);
      }
      return snapshotOf(current);
    },

    chunk({ step: name, text } = {}) {
      if (!current) return null;
      const step = current.steps.find((entry) => entry.name === String(name ?? ''));
      if (!step) return null;
      const next = step.output + String(text ?? '');
      if (next.length > limit) {
        step.output = `…（输出超过 ${limit} 字符，已保留末尾）\n${next.slice(-limit)}`;
        current.truncated = true;
      } else {
        step.output = next;
      }
      return null;
    },

    finish(result = {}) {
      if (!current) return last ? snapshotOf(last) : null;
      current.state = result.success ? 'success' : 'failed';
      current.endedAt = now().toISOString();
      last = current;
      current = null;
      return snapshotOf(last);
    },

    /** 正在跑就返回当前快照，否则返回上一次（没有就是 null）。 */
    snapshot() {
      if (current) return snapshotOf(current);
      return last ? snapshotOf(last) : null;
    },

    get running() {
      return Boolean(current);
    },
  };
}

function deployHistoryFile(root, digestDir) {
  return path.join(root, digestDir || '.hotspot', 'deploy-history.json');
}

/** 部署历史只是面板的辅助信息，读写失败不能影响部署结果本身。 */
export async function readDeployHistory(root, digestDir) {
  if (!root) return [];
  try {
    const raw = await readFile(deployHistoryFile(root, digestDir), 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, DEPLOY_HISTORY_LIMIT) : [];
  } catch {
    return [];
  }
}

export async function appendDeployHistory(root, digestDir, entry) {
  if (!root) return [];
  const file = deployHistoryFile(root, digestDir);
  const history = [entry, ...(await readDeployHistory(root, digestDir))].slice(0, DEPLOY_HISTORY_LIMIT);
  try {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, `${JSON.stringify(history, null, 2)}\n`, 'utf8');
  } catch {
    /* 历史写不进去不影响本次部署 */
  }
  return history;
}

