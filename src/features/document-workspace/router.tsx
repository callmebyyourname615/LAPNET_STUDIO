import { Link as RouterLink, useLocation, useNavigate as useRouterNavigate } from "react-router-dom";
import { useCallback, useMemo, type ComponentProps } from "react";

type Search = Record<string, unknown>;
type Destination = { to: string; params?: Record<string, string>; search?: Search | ((previous: Search) => Search) };

export function workspaceHref({ to, params, search }: Destination, pathname: string, previous: Search = {}) {
  let path = to === "." ? pathname : to;
  for (const [key, value] of Object.entries(params ?? {})) path = path.replace("$" + key, encodeURIComponent(value));
  if (path === "/documents" || path.startsWith("/documents/")) path = path.replace("/documents", "/document-workspace");
  else if (path.startsWith("/companies/")||path.startsWith('/tasks/')||path.startsWith('/feed')||path.startsWith('/interactions/')) path = '/document-workspace/portal'+path;
  const values = typeof search === "function" ? search(previous) : search;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values ?? {})) if (value !== undefined && value !== null && value !== "") query.set(key, String(value));
  return path + (query.size ? "?" + query : "");
}

export function useSearch(_options?: { strict?: boolean }) {
  const { search } = useLocation();
  return useMemo(() => Object.fromEntries(new URLSearchParams(search)), [search]);
}

/** Adapt the imported document UI to the portal's existing React Router. */
export function useNavigate() {
  const navigate = useRouterNavigate();
  const { pathname } = useLocation();
  const search = useSearch();
  return useCallback((destination: Destination) => navigate(workspaceHref(destination, pathname, search)), [navigate, pathname, search]);
}

export function Link({ to, params, search, ...props }: Omit<ComponentProps<typeof RouterLink>, "to"> & Destination) {
  const { pathname } = useLocation();
  const previous = useSearch();
  return <RouterLink {...props} to={workspaceHref({ to, params, search }, pathname, previous)} />;
}
