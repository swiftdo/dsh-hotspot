/**
 * 管理界面的 HTTP 基础层：响应、请求体解析，以及「只允许本机同源」的三道守卫。
 *
 * 插件路由不走平台鉴权（`webServer.register` 的语义如此），所以这里自己守：
 * loopback 来源、拒绝 `sec-fetch-site: cross-site`、`origin` 与 `host` 同源。
 * 单独成文件是因为它是纯协议层，和「热点」这件事没有关系 ——
 * 放在 1700 行的路由文件里只会让人以为它属于某条业务路由。
 */
const MAX_BODY = 64 * 1024;

export function sendJson(res, status, value) {
  const body = JSON.stringify(value, null, 2);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

export function sendHtml(res, html) {
  res.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(html),
  });
  res.end(html);
}

export function readJson(req) {
  return new Promise((resolve) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        req.destroy();
        resolve(undefined);
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        resolve(undefined);
      }
    });
    req.on('error', () => resolve(undefined));
  });
}

export function isLoopback(req) {
  const address = req.socket?.remoteAddress ?? '';
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

export function isAllowed(req) {
  if (req.headers['sec-fetch-site'] === 'cross-site') return false;
  const host = req.headers.host;
  const origin = req.headers.origin;
  if (origin && host) {
    try {
      if (new URL(origin).host !== host) return false;
    } catch {
      return false;
    }
  }
  return isLoopback(req);
}

export function guard(req, res, methods) {
  if (!isAllowed(req)) {
    sendJson(res, 403, { ok: false, message: '只接受本机同源请求' });
    return false;
  }
  if (methods && !methods.includes(req.method)) {
    sendJson(res, 405, { ok: false, message: `不支持 ${req.method}` });
    return false;
  }
  return true;
}

