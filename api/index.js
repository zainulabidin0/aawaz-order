// Vercel serverless function — Remix SSR entry
const {
  createRequestHandler,
  createReadableStreamFromReadable,
  writeReadableStreamToWritable,
} = require("@remix-run/node");
const { pathToFileURL } = require("url");
const path = require("path");

const buildPath = pathToFileURL(
  path.join(__dirname, "..", "build", "server", "index.js"),
).href;

let remixHandler;

async function getHandler() {
  if (!remixHandler) {
    const build = await import(buildPath);
    remixHandler = createRequestHandler(
      build,
      process.env.NODE_ENV || "production",
    );
  }
  return remixHandler;
}

function createWebRequest(req) {
  const host =
    req.headers.host || req.headers["x-forwarded-host"] || "localhost";
  const protocol = (req.headers["x-forwarded-proto"] || "https")
    .split(",")[0]
    .trim();
  const url = new URL(req.url, `${protocol}://${host}`);

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else {
      headers.set(key, value);
    }
  }

  const init = { method: req.method, headers };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = createReadableStreamFromReadable(req);
    init.duplex = "half";
  }

  return new Request(url.href, init);
}

async function sendWebResponse(res, webResponse) {
  res.statusCode = webResponse.status;

  for (const [key, value] of webResponse.headers.entries()) {
    if (key.toLowerCase() === "set-cookie") continue;
    res.setHeader(key, value);
  }

  // Vercel/Node drops OAuth cookies if multiple Set-Cookie headers are merged.
  if (typeof webResponse.headers.getSetCookie === "function") {
    for (const cookie of webResponse.headers.getSetCookie()) {
      res.appendHeader("Set-Cookie", cookie);
    }
  } else {
    const setCookie = webResponse.headers.get("set-cookie");
    if (setCookie) res.setHeader("Set-Cookie", setCookie);
  }

  if (webResponse.body) {
    await writeReadableStreamToWritable(webResponse.body, res);
  } else {
    res.end();
  }
}

module.exports = async (req, res) => {
  try {
    const handler = await getHandler();
    const request = createWebRequest(req);
    const response = await handler(request);
    await sendWebResponse(res, response);
  } catch (err) {
    console.error("[AawazOrder] Server error:", err);
    res.statusCode = 500;
    res.end("Internal Server Error");
  }
};
