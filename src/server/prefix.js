/**
 * 路由前缀。每个路径都同时注册在这两个前缀下：`/dsh-hotspot` 是正式名，
 * `/hotspot` 是旧名 —— 老书签、老面板与文档里的 curl 示例还在用它。
 *
 * 单列一个模块是因为它被 api（注册路由）、state（RSS 地址）和插件日志同时引用，
 * 而 state 不该反过来依赖 api（那会形成环）。
 */
export const PREFIX = '/dsh-hotspot';
export const LEGACY_PREFIX = '/hotspot';
