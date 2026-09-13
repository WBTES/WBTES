"use client";

import * as React from "react";
import type { Program } from "@/lib/types";

export function usePrograms() {
  const [programs, setPrograms] = React.useState<Program[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/programs", { cache: "no-store" });
      const data = await response.json() as {
        programs?: Program[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error ?? "Programs could not be loaded.");
      }
      setPrograms(data.programs ?? []);
      setError("");
    } catch (requestError) {
      setPrograms([]);
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Programs could not be loaded."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    programs,
    loading,
    error,
    refresh,
  };
}
