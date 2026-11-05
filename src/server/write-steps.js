/**
 * 「生成草稿」这条链路的固定六步。
 *
 * 为什么是常量而不是各调用点自己写：服务端打点（writer）、接口起任务（api）、
 * 面板渲染（client）三处必须说同一套词，否则用户看到的「第 3 步」跟实际干的事对不上。
 * 顺序即真相：scaffold 在 HTTP 请求里同步做完，其余五步在后台任务里依次推进。
 */
export const WRITE_STEPS = [
  { key: 'scaffold', label: '建草稿' },
  { key: 'resolve', label: '定位候选' },
  { key: 'brief', label: '收集一手素材' },
  { key: 'route', label: '选模型' },
  { key: 'write', label: '生成正文' },
  { key: 'persist', label: '写盘与校验' },
];

/**
 * 起任务时的步骤模板：`scaffold` 已经由调用方（`POST /api/scaffold`）落盘完成，
 * 所以第一格直接是 done —— 面板一打开就能看到「草稿文件已经在了」，而不是从零转圈。
 *
 * @param {{ scaffoldDetail?: string, now?: Date }} [opts]
 */
export function writeSteps({ scaffoldDetail = '', now = new Date() } = {}) {
  const at = now.toISOString();
  return WRITE_STEPS.map((step, index) =>
    index === 0
      ? { ...step, state: 'done', startedAt: at, endedAt: at, detail: String(scaffoldDetail ?? '') }
      : { ...step, state: 'pending', startedAt: '', endedAt: '', detail: '' },
  );
}
