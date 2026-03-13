"use strict";

const path = require("path");
const { Worker } = require("worker_threads");

function buildRenderRequest(options) {
  const safeOptions = options || {};
  return {
    map: safeOptions.map,
    format: safeOptions.format || "",
    render_options: {
      output_path: safeOptions.output_path ? path.resolve(safeOptions.output_path) : "",
      show_grid: safeOptions.show_grid
    }
  };
}

function renderMapAsync(options) {
  const request = buildRenderRequest(options);
  const workerPath = path.resolve(__dirname, "map-render-worker.js");

  return new Promise((resolve, reject) => {
    let settled = false;
    const worker = new Worker(workerPath, {
      workerData: { request }
    });

    worker.once("message", (message) => {
      settled = true;
      if (!message || message.ok !== true) {
        reject(new Error(message && message.error ? message.error : "map render worker failed"));
        return;
      }

      resolve({
        ok: true,
        event_type: "map_render_completed",
        payload: {
          format: message.format,
          output_path: message.output_path || null
        }
      });
    });

    worker.once("error", (error) => {
      settled = true;
      reject(error);
    });

    worker.once("exit", (code) => {
      if (!settled && code !== 0) {
        reject(new Error(`map render worker exited with code ${code}`));
      }
    });
  });
}

function createMapRenderQueue(options) {
  const safeOptions = options || {};
  const concurrency = Math.max(1, Number(safeOptions.concurrency) || 1);
  const pending = [];
  let activeCount = 0;

  function pumpQueue() {
    while (activeCount < concurrency && pending.length > 0) {
      const next = pending.shift();
      activeCount += 1;

      renderMapAsync(next.request)
        .then(next.resolve)
        .catch(next.reject)
        .finally(() => {
          activeCount -= 1;
          pumpQueue();
        });
    }
  }

  return {
    enqueueRender(request) {
      return new Promise((resolve, reject) => {
        pending.push({ request, resolve, reject });
        setImmediate(pumpQueue);
      });
    },
    getState() {
      return {
        active_count: activeCount,
        pending_count: pending.length,
        concurrency
      };
    }
  };
}

module.exports = {
  buildRenderRequest,
  renderMapAsync,
  createMapRenderQueue
};
