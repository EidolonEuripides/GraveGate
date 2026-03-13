"use strict";

const path = require("path");
const { parentPort, workerData } = require("worker_threads");
const { renderMapSvg } = require("./render-map-svg");
const { renderMapPng } = require("./render-map-png");

async function main() {
  const request = workerData && workerData.request ? workerData.request : {};
  const map = request.map;
  const renderOptions = request.render_options || {};
  const outputPath = renderOptions.output_path
    ? path.resolve(renderOptions.output_path)
    : "";
  const format = String(request.format || path.extname(outputPath || "").slice(1) || "svg").toLowerCase();

  if (format === "png") {
    const writtenPath = await renderMapPng(map, renderOptions);
    parentPort.postMessage({
      ok: true,
      format: "png",
      output_path: writtenPath
    });
    return;
  }

  renderMapSvg(map, renderOptions);
  parentPort.postMessage({
    ok: true,
    format: "svg",
    output_path: outputPath || null
  });
}

main().catch((error) => {
  parentPort.postMessage({
    ok: false,
    error: error && error.stack ? error.stack : String(error)
  });
});
