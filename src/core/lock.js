/**
 * 单飞（single-flight）：同一件事同时只允许一次在跑。
 *
 * 用在抓取上：一次 run 会写当天的 digest 与 raw，两次并发会互相覆盖 ——
 * 候选 id（h-YYYYMMDD-NN）是按排序现场分配的，覆盖后「#3」可能指向另一条。
 * 面板双击、agent 连续两次调用都能触发，所以要在入口挡掉，而不是靠人别点。
 *
 * 刻意不做排队：第二次请求直接拒绝，让调用方自己决定要不要重试。
 * 排队会让「点两下」变成「跑两次」，那正是要避免的。
 */
export function createSingleFlight(fn, { message = '上一次还没跑完', code = 'ERR_BUSY' } = {}) {
  let running = false;

  return async function runOnce(...args) {
    if (running) {
      const error = new Error(message);
      error.code = code;
      throw error;
    }
    running = true;
    try {
      return await fn(...args);
    } finally {
      running = false;
    }
  };
}
