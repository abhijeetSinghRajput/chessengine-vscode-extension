export function handleError(error, message = "Something went wrong") {
  console.error(message, error);

  window.__chanakyaVsCodeApi?.postMessage({
    command: "showError",
    message,
    details:
      error instanceof Error ? (error.stack ?? error.message) : String(error),
  });
}
