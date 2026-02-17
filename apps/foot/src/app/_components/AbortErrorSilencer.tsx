"use client";

import { useEffect } from "react";

export default function AbortErrorSilencer() {
  useEffect(() => {
    const handler = (event: PromiseRejectionEvent) => {
      const reason = event.reason as
        | { name?: string; message?: string }
        | null
        | undefined;
      const name = reason?.name ?? "";
      const message = String(reason?.message ?? "");
      if (
        name === "AbortError" ||
        message.toLowerCase().includes("aborted")
      ) {
        event.preventDefault();
      }
    };

    const errorHandler = (event: ErrorEvent) => {
      const message = String(event.message ?? "");
      const name = (event.error as { name?: string } | null)?.name ?? "";
      if (
        name === "AbortError" ||
        message.toLowerCase().includes("aborted")
      ) {
        event.preventDefault();
      }
    };

    window.addEventListener("unhandledrejection", handler);
    window.addEventListener("error", errorHandler);
    return () => {
      window.removeEventListener("unhandledrejection", handler);
      window.removeEventListener("error", errorHandler);
    };
  }, []);

  return null;
}
