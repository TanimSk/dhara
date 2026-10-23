import { useQuery } from "@tanstack/react-query";

import { get, getOrgId } from "../lib/api";
import type { Library } from "../lib/types";

export function useLibraries() {
  return useQuery({
    queryKey: ["libraries", getOrgId()],
    queryFn: () => get<{ results: Library[] }>("/libraries").then((d) => d.results),
  });
}
