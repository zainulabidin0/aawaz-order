// Vercel serverless function — Remix SSR entry
// All non-static requests are routed here via vercel.json rewrites.

const { createRequestHandler } = require("@remix-run/node");
const path = require("path");

const buildPath = path.join(__dirname, "..", "build", "server", "index.js");

let handler;

async function getHandler() {
  if (!handler) {
    // Clear require cache on each cold start to pick up fresh build
    const build = await import(buildPath);
    handler = createRequestHandler(build, process.env.NODE_ENV || "production");
  }
  return handler;
}

module.exports = async (req, res) => {
  try {
    const h = await getHandler();
    await h(req, res);
  } catch (err) {
    console.error("[AawazOrder] Server error:", err);
    res.statusCode = 500;
    res.end("Internal Server Error");
  }
};
