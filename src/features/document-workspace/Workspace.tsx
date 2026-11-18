import { useLocation } from "react-router-dom";
import { Suspense, useEffect, type ReactNode } from "react";
import { Lock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { PortalProvider, useData, useMe, useNetwork, useService } from "./lib/portal";
import { I18nProvider, useI18n } from "./lib/i18n";
import { AppShell, useShell } from "./components/portal/shell";
import { Button, Drawer, EmptyState, ErrorState, TipProvider } from "./components/portal/ui";
import { FolderActionsProvider, FolderNavigator } from "./components/docs/folders";
import { DocumentLibrary, DocsHeader } from "./components/docs/library";
import { DocumentDetail } from "./components/docs/detail";
import { findVisibleDoc } from "./lib/domain/selectors";
import { Link } from "./router";

export default function DocumentWorkspace({
  switcher,
  actions,
  sharedContent,
  sharedTitle,
}: {
  switcher: ReactNode;
  actions: ReactNode;
  sharedContent?: ReactNode;
  sharedTitle?: string;
}) {
  return (
    <div className="document-workspace" data-document-workspace>
      <PortalProvider>
        <I18nProvider>
          <TipProvider>
            <AppShell switcher={switcher} actions={actions}>
              <Suspense fallback={<Skeleton variant="page" />}>
                <DocumentRoutes sharedContent={sharedContent} sharedTitle={sharedTitle} />
              </Suspense>
            </AppShell>
          </TipProvider>
        </I18nProvider>
      </PortalProvider>
    </div>
  );
}

function DocumentRoutes({
  sharedContent,
  sharedTitle,
}: {
  sharedContent?: ReactNode;
  sharedTitle?: string;
}) {
  const { pathname, search } = useLocation();
  const data = useData();
  const me = useMe();
  const { t } = useI18n();
  const network = useNetwork(),
    service = useService();
  const { drawer, setDrawer } = useShell();
  const folderId = pathname.match(/^\/document-workspace\/folders\/([^/]+)$/)?.[1];
  const related = pathname.match(
    /^\/document-workspace\/related\/(company|task|post)(?:\/([^/]+))?$/,
  );
  const id =
    !folderId && !related ? pathname.match(/^\/document-workspace\/([^/]+)$/)?.[1] : undefined;
  const doc = id ? findVisibleDoc(data, id, me) : undefined;
  useEffect(() => {
    if (network.state === "ready") void service.loadDocument(id ?? "");
  }, [id, network.state, service]);
  const selectedId = folderId ?? doc?.folderId ?? null;
  let content: ReactNode;
  if (sharedContent !== undefined) {
    content = (
      <>
        <DocsHeader>
          <span className="t-label">{sharedTitle}</span>
        </DocsHeader>
        <main id="document-main" className="page-pad document-shared-page">
          {sharedContent}
        </main>
      </>
    );
  } else if (network.state === "loading") {
    content = (
      <>
        <DocsHeader />
        <main id="document-main" className="page-pad">
          <Skeleton variant="page" />
        </main>
      </>
    );
  } else if (network.state === "error") {
    content = (
      <>
        <DocsHeader />
        <main id="document-main" className="page-pad">
          <ErrorState
            title={t("error_title")}
            hint={t("error_hint")}
            onRetry={() => void service.load()}
            retryLabel={t("retry")}
          />
        </main>
      </>
    );
  } else if (id && (network.detailId !== id || network.detailLoading)) {
    content = (
      <>
        <DocsHeader />
        <main id="document-main" className="page-pad">
          <Skeleton variant="detail" />
        </main>
      </>
    );
  } else if (related) {
    content = (
      <>
        <DocsHeader />
        <main id="document-main" className="page-pad">
          <EmptyState
            title={t("unavailable")}
            action={<Link to="/documents">{t("go_docs")}</Link>}
          />
        </main>
      </>
    );
  } else if ((folderId && !data.folders.some((folder) => folder.id === folderId)) || (id && !doc)) {
    content = (
      <>
        <DocsHeader />
        <main id="document-main" className="page-pad">
          <EmptyState
            icon={Lock}
            title={t("unavailable")}
            hint={t("unavailable_hint")}
            action={<Link to="/documents">{t("go_docs")}</Link>}
          />
        </main>
      </>
    );
  } else
    content = doc ? (
      <DocumentDetail key={doc.id} doc={doc} />
    ) : (
      <DocumentLibrary folderId={folderId ?? null} />
    );
  return (
    <FolderActionsProvider selectedId={selectedId}>
      <aside className="shell-folders border-r border-line" aria-label={t("workspace")}>
        <FolderNavigator />
      </aside>
      <Drawer
        open={drawer === "folders"}
        onOpenChange={(open) => setDrawer(open ? "folders" : null)}
        title={t("folders")}
      >
        <FolderNavigator onNavigate={() => setDrawer(null)} />
      </Drawer>
      <div className="shell-main">
        {network.error && network.state === "ready" && (
          <div
            role="alert"
            className="flex flex-wrap items-center gap-3 border-b border-line bg-danger-bg px-4 py-3 text-danger t-body"
          >
            <span>{t(network.error as "REQUEST_FAILED") ?? t("error_hint")}</span>
            <Button size="sm" onClick={() => void service.load()}>
              {t("retry")}
            </Button>
          </div>
        )}
        {content}
      </div>
    </FolderActionsProvider>
  );
}
