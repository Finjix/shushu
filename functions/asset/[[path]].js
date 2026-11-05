// Cloudflare Pages 的静态资源不支持 Range：请求任何字节区间都返回 200 和完整文件。
// 浏览器因此只能在已缓冲的部分内拖动进度条，跳到未缓冲的位置时会从头重新加载、回到开头；
// Safari / iOS 甚至拒绝播放不支持分段的 MP4。这个 Function 只处理视频（见 public/_routes.json），
// 从 env.ASSETS 取出完整文件后按 Range 切出对应字节，返回 206 / 416。

// Function 内的资源绑定可能不带 Content-Length，此时用这里登记的字节数构造 Content-Range。
// 新增或替换视频时同步更新此表和 public/_routes.json（tests/video-ranges.test.cjs 会校验）。
export const VIDEO_SIZES = {
  "/asset/case01/marketing-multi-size-ab-skill-vp9-1040x585.webm": 1612714,
  "/asset/case02/成片03-vp9-720x1280.webm": 6742265,
  "/asset/casex/platform-demo.mp4": 16695512,
  "/asset/intern01/智能GIF生成-vp9-1600x900.webm": 2130813,
  "/asset/intern02/左右对比-vp9-1080x960.webm": 20471293,
  "/asset/intern02/聪哥动效-vp9-720x1280.webm": 1861036,
  "/asset/showcase/agent-xiaonai-demo-vp9-1200x675.webm": 1511247,
  "/asset/showcase/分镜助手-vp9-1280x720.webm": 717048,
};

const UNSATISFIABLE = "unsatisfiable";

// 只支持单个区间；多区间或格式不对时忽略 Range，返回完整文件（RFC 9110 允许）。
export const parseRange = (header, size) => {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (!match[1] && !match[2])) return null;
  const [, first, last] = match;
  if (!first) {
    const suffix = Number(last);
    return suffix > 0 ? { start: Math.max(0, size - suffix), end: size - 1 } : UNSATISFIABLE;
  }
  const start = Number(first);
  if (last && Number(last) < start) return null;
  if (start >= size) return UNSATISFIABLE;
  return { start, end: last ? Math.min(Number(last), size - 1) : size - 1 };
};

// 从完整文件流中切出 [start, end]，读到 end 后取消上游读取。
const sliceStream = (body, start, end) => {
  const reader = body.getReader();
  let offset = 0;
  return new ReadableStream({
    async pull(controller) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return controller.close();
        const chunkStart = offset;
        offset += value.byteLength;
        if (offset <= start) continue;
        controller.enqueue(value.subarray(Math.max(0, start - chunkStart), Math.min(value.byteLength, end + 1 - chunkStart)));
        if (offset > end) {
          controller.close();
          reader.cancel().catch(() => {});
        }
        return;
      }
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
};

// Workers 运行时对普通 ReadableStream 使用分块传输；FixedLengthStream 让响应带上准确的 Content-Length。
const withLength = (stream, length) => {
  if (typeof FixedLengthStream !== "function") return stream;
  const { readable, writable } = new FixedLengthStream(length);
  stream.pipeTo(writable).catch(() => {});
  return readable;
};

export async function onRequest({ request, env, next }) {
  if (request.method !== "GET" && request.method !== "HEAD") return next();
  let path;
  try {
    path = decodeURIComponent(new URL(request.url).pathname);
  } catch {
    return next();
  }
  const assetHeaders = new Headers(request.headers);
  assetHeaders.delete("Range");
  assetHeaders.delete("If-Range");
  const asset = await env.ASSETS.fetch(new Request(request.url, { method: "GET", headers: assetHeaders }));
  const size = Number(asset.headers.get("Content-Length")) || VIDEO_SIZES[path];
  // 404、304 等以及压缩过的响应原样返回（分段按编码后的字节计算，这里不处理）。
  if (asset.status !== 200 || !asset.body || !size || asset.headers.has("Content-Encoding")) return asset;

  const headers = new Headers(asset.headers);
  headers.set("Accept-Ranges", "bytes");
  const ifRange = request.headers.get("If-Range");
  const rangeHeader = request.headers.get("Range");
  const range = rangeHeader && (!ifRange || ifRange === asset.headers.get("ETag") || ifRange === asset.headers.get("Last-Modified"))
    ? parseRange(rangeHeader, size)
    : null;
  const isHead = request.method === "HEAD";

  if (range === UNSATISFIABLE) {
    asset.body.cancel().catch(() => {});
    headers.set("Content-Range", `bytes */${size}`);
    headers.set("Content-Length", "0");
    return new Response(null, { status: 416, headers });
  }
  if (!range) {
    headers.set("Content-Length", String(size));
    if (isHead) asset.body.cancel().catch(() => {});
    return new Response(isHead ? null : withLength(asset.body, size), { status: 200, headers });
  }
  const length = range.end - range.start + 1;
  headers.set("Content-Range", `bytes ${range.start}-${range.end}/${size}`);
  headers.set("Content-Length", String(length));
  if (isHead) {
    asset.body.cancel().catch(() => {});
    return new Response(null, { status: 206, headers });
  }
  return new Response(withLength(sliceStream(asset.body, range.start, range.end), length), { status: 206, headers });
}
