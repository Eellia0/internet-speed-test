import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["speed-test.mjs", ...args]);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (data) => { stdout += data; });
    child.stderr.on("data", (data) => { stderr += data; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

test("10 последовательных запросов, полное тело и расчёты", async () => {
  let requests = 0;
  let active = 0;
  let maxActive = 0;
  const server = createServer((_request, response) => {
    requests += 1;
    active += 1;
    maxActive = Math.max(maxActive, active);
    response.write(Buffer.alloc(1000));
    setTimeout(() => {
      active -= 1;
      response.end(Buffer.alloc(2000));
    }, 20);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const result = await run(["http://127.0.0.1:" + server.address().port]);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(requests, 10);
    assert.equal(maxActive, 1);
    assert.match(result.stdout, /Всего скачано: 30000 байт/);
    const durations = [...result.stdout.matchAll(/3000 байт, ([\d.]+) мс/g)]
      .map((match) => Number(match[1]));
    assert.equal(durations.length, 10);
    const sum = durations.reduce((total, value) => total + value, 0);
    const average = Number(result.stdout.match(/Среднее время запроса: ([\d.]+)/)[1]);
    const speed = Number(result.stdout.match(/Скорость скачивания: ([\d.]+)/)[1]);
    assert.ok(Math.abs(average - sum / 10) <= 0.011);
    assert.ok(Math.abs(speed - 30000 / (sum / 1000) / 1_000_000) < 0.001);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("ошибки аргументов", async () => {
  for (const args of [[], ["invalid"], ["ftp://example.com/file"]]) {
    const result = await run(args);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /Ошибка:/);
    assert.doesNotMatch(result.stdout, /Скорость скачивания:/);
  }
});

test("HTTP-ошибка прекращает замер", async () => {
  let requests = 0;
  const server = createServer((_request, response) => {
    requests += 1;
    response.writeHead(404);
    response.end("Not found");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const result = await run(["http://127.0.0.1:" + server.address().port]);
    assert.equal(result.code, 1);
    assert.equal(requests, 1);
    assert.match(result.stderr, /HTTP 404/);
    assert.doesNotMatch(result.stdout, /Скорость скачивания:/);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
