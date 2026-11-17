import { performance } from "node:perf_hooks";

const REQUEST_COUNT = 10;
const TIMEOUT_MS = 60_000;

async function main() {
  if (process.argv.length !== 3) {
    throw new Error('Запуск: node speed-test.mjs "https://example.com/file.jpg"');
  }

  const url = new URL(process.argv[2]);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Поддерживаются только адреса HTTP и HTTPS.");
  }

  let totalBytes = 0;
  let totalMs = 0;

  for (let index = 1; index <= REQUEST_COUNT; index += 1) {
    const startedAt = performance.now();
    const response = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "Accept-Encoding": "identity" },
    });

    if (!response.ok) {
      await response.body?.cancel();
      throw new Error("Сервер вернул HTTP " + response.status);
    }

    let bytes = 0;
    if (response.body) {
      for await (const chunk of response.body) {
        bytes += chunk.byteLength;
      }
    }

    const elapsedMs = performance.now() - startedAt;
    totalBytes += bytes;
    totalMs += elapsedMs;
    console.log(
      "Запрос " + index + "/" + REQUEST_COUNT + ": " +
      bytes + " байт, " + elapsedMs.toFixed(2) + " мс",
    );
  }

  const speed = totalBytes / (totalMs / 1000) / 1_000_000;
  console.log("\nСреднее время запроса: " + (totalMs / REQUEST_COUNT).toFixed(2) + " мс");
  console.log("Всего скачано: " + totalBytes + " байт");
  console.log("Скорость скачивания: " + speed.toFixed(3) + " МБ/с");
}

main().catch((error) => {
  const message = error.name === "TimeoutError"
    ? "Превышено время ожидания запроса (60 секунд)."
    : error.message;
  console.error("Ошибка: " + message);
  process.exitCode = 1;
});
