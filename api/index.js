// Vercel serverless function — Remix SSR entry (Web Fetch API)
const { createRequestHandler } = require("@remix-run/node");
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

module.exports = async (request) => {
  try {
    const handler = await getHandler();
    return await handler(request);
  } catch (err) {
    console.error("[AawazOrder] Server error:", err);
    return new Response("Internal Server Error", { status: 500 });
  }
};
