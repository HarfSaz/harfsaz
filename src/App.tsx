import { CollapseRight as PanelRightClose, Sparkles } from "./components/ui/icons";
import { MenuBar } from "./components/MenuBar";
import { Toolbar } from "./components/Toolbar";
import { ObjectBar } from "./components/ObjectBar";
import { StatusBar } from "./components/StatusBar";
import { Toolbox } from "./components/Toolbox";
import { Ruler } from "./components/Ruler";
import { ViewBar } from "./components/ViewBar";
import { PrintDialog } from "./components/PrintDialog";
import { UpgradeDialog } from "./components/UpgradeDialog";
import { SettingsDialog } from "./components/SettingsDialog";
import { KeyboardHelp } from "./components/KeyboardHelp";
import { SelectionMenu } from "./editor/SelectionMenu";
import { PageCanvas } from "./editor/PageCanvas";
import { AiPanel } from "./components/AiPanel";
import { TooltipProvider, IconTip } from "./components/ui/tooltip";
import { Button } from "./components/ui/button";
import { useDoc, useSelectedFrame } from "./lib/store";
import { useUi } from "./lib/ui";
import { useShortcuts } from "./lib/shortcuts";

export function App() {
  const pages = useDoc((s) => s.pages);
  useShortcuts();

  const aiOpen = useUi((s) => s.aiPanelOpen);
  const objectBarOpen = useUi((s) => s.objectBarOpen);
  const toggleAi = useUi((s) => s.toggleAiPanel);

  // Show the frame/object bar when toggled on, OR whenever a placed (non-page)
  // frame is selected — so image/shape controls are always reachable.
  const sel = useSelectedFrame();
  const showObjectBar = objectBarOpen || (!!sel && !sel.frame.isPageFrame);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-full flex-col" dir="ltr">
        <MenuBar />
        <Toolbar />
        {showObjectBar && <ObjectBar />}

        <div className="flex min-h-0 flex-1">
          <Toolbox />

          {/* Canvas column: view bar + scrollable page area */}
          <div className="relative flex min-w-0 flex-1 flex-col">
            <ViewBar />
            <main className="relative flex-1 overflow-auto bg-paper-edge">
              <CanvasStage pages={pages} />

              {/* Floating AI toggle when the panel is collapsed */}
              {!aiOpen && (
                <div className="absolute right-3 top-3 z-10">
                  <IconTip label="Open AI panel">
                    <Button variant="primary" size="icon" onClick={toggleAi}>
                      <Sparkles size={18} />
                    </Button>
                  </IconTip>
                </div>
              )}
            </main>
          </div>

          {/* Collapsible AI panel */}
          {aiOpen && (
            <div className="relative flex w-[340px] flex-shrink-0 flex-col border-l border-line bg-surface">
              <button
                onClick={toggleAi}
                title="Collapse panel"
                className="absolute left-2 top-2.5 z-10 rounded-md p-1 text-ink-soft hover:bg-paper-edge"
              >
                <PanelRightClose size={18} />
              </button>
              <AiPanel />
            </div>
          )}
        </div>

        <StatusBar />
        <PrintDialog />
        <UpgradeDialog />
        <SettingsDialog />
        <KeyboardHelp />
        <SelectionMenu />
      </div>
    </TooltipProvider>
  );
}

/** Renders ALL pages stacked vertically (continuous document), zoomable. */
function CanvasStage({ pages }: { pages: ReturnType<typeof useDoc.getState>["pages"] }) {
  const zoom = useUi((s) => s.zoom);
  const activePageId = useDoc((s) => s.activePageId);
  const setActivePage = useDoc((s) => s.setActivePage);
  const pageW = pages[0]?.width ?? 794;

  return (
    <div className="flex w-full flex-col items-center gap-0 px-4 py-4">
      <div style={{ width: pageW * zoom }}>
        <Ruler pageWidth={pageW} />
      </div>

      {pages.map((page, i) => (
        <div key={page.id} className="flex flex-col items-center">
          <div
            style={{ width: page.width * zoom, height: page.height * zoom }}
            className={`mt-4 ${page.id === activePageId ? "ring-2 ring-accent/40" : ""}`}
            onMouseDown={() => setActivePage(page.id)}
          >
            <div
              style={{
                transform: `scale(${zoom})`,
                transformOrigin: "top left",
                width: page.width,
                height: page.height,
              }}
            >
              <PageCanvas page={page} />
            </div>
          </div>
          <div className="mt-1 text-[11px] text-ink-soft">
            Page {i + 1} of {pages.length}
          </div>
        </div>
      ))}
    </div>
  );
}
