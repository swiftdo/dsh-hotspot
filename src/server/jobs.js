/**
 * 后台任务执行器。
 *
 * 为什么要它：一次「生成草稿」要在后台起一个子代理去搜、读、写，5 秒到几分钟。
 * 如果让 HTTP 请求同步等着，浏览器一刷新、宿主一重启，结果就没了，面板也只能干等。
 * 所以把执行挪到这里：接口立刻返回 job，前端轮询状态，任务自己跑完再落盘。
 *
 * 边界：
 * - 同一个 slug 同时只允许一个任务（双击按钮不该起两个子代理）。
 * - 任务体与落盘都在调用方（plugin / api）给，这里只管状态机 + 记录。
 * - 记录落盘失败不影响任务本身 —— 状态是辅助信息，不是真相。
 */

/** 内存里保留最近多少个任务。落盘的记录才是跨重启的那一份。 */
const MAX_JOBS = 50;

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error ?? '');
}

export function createJobRunner({ log = () => {}, persist = null, now = () => new Date() } = {}) {
  const jobs = new Map();
  const runningBySlug = new Map();

  function snapshot(job) {
    return {
      id: job.id,
      slug: job.slug,
      kind: job.kind,
      state: job.state,
      startedAt: job.startedAt,
      endedAt: job.endedAt,
      message: job.message,
      error: job.error,
      result: job.result,
    };
  }

  async function persistJob(job) {
    if (typeof persist !== 'function') return;
    try {
      await persist(snapshot(job));
    } catch (error) {
      log(`任务状态落盘失败：${errorMessage(error)}`);
    }
  }

  function prune() {
    if (jobs.size <= MAX_JOBS) return;
    const finished = [...jobs.values()]
      .filter((job) => job.state !== 'running')
      .sort((a, b) => String(a.startedAt).localeCompare(String(b.startedAt)));
    while (jobs.size > MAX_JOBS && finished.length > 0) {
      jobs.delete(finished.shift().id);
    }
  }

  return {
    /**
     * 起一个任务。立刻返回快照，不等任务体跑完。
     * @param {{ slug: string, kind?: string, message?: string, run: () => Promise<any> }} input
     */
    start({ slug, kind = 'write', message = '正在写正文', run } = {}) {
      const clean = String(slug ?? '').trim();
      if (!clean) throw new Error('缺少 slug');
      if (typeof run !== 'function') throw new Error('缺少任务体');

      const busy = runningBySlug.get(clean);
      if (busy) {
        const error = new Error(`「${clean}」还有一个任务在跑，等它结束再点`);
        error.code = 'ERR_JOB_BUSY';
        throw error;
      }

      const job = {
        id: `job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        slug: clean,
        kind,
        state: 'running',
        startedAt: now().toISOString(),
        endedAt: '',
        message,
        error: '',
        result: null,
      };
      jobs.set(job.id, job);
      runningBySlug.set(clean, job.id);
      log(`任务 ${job.id} 开始：${clean}`);

      // 立刻返回快照：任务体自己跑，不挂在调用方（HTTP 请求）上
      void persistJob(job);
      Promise.resolve()
        .then(run)
        .then((result) => {
          job.state = 'done';
          job.message = '正文已写入';
          job.result = result ?? null;
        })
        .catch((error) => {
          job.state = 'failed';
          job.error = errorMessage(error);
          job.message = '正文失败，可重试';
        })
        .finally(async () => {
          job.endedAt = now().toISOString();
          if (runningBySlug.get(clean) === job.id) runningBySlug.delete(clean);
          log(`任务 ${job.id} 结束：${job.state}${job.error ? `（${job.error}）` : ''}`);
          await persistJob(job);
          prune();
        });

      return snapshot(job);
    },

    get(id) {
      const job = jobs.get(String(id ?? ''));
      return job ? snapshot(job) : null;
    },

    /** 按开始时间倒序；传 slug 只看那一篇。 */
    list({ slug } = {}) {
      const wanted = slug ? String(slug).trim() : '';
      return [...jobs.values()]
        .filter((job) => !wanted || job.slug === wanted)
        .sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)))
        .map(snapshot);
    },

    runningFor(slug) {
      const id = runningBySlug.get(String(slug ?? '').trim());
      const job = id ? jobs.get(id) : null;
      return job ? snapshot(job) : null;
    },

    get size() {
      return jobs.size;
    },
  };
}
