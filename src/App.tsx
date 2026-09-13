import { CollapseRight as PanelRightClose } from "./components/ui/icons";
import { MenuBar } from "./components/MenuBar";
import { ParagraphBar } from "./components/ParagraphBar";
import { Toolbar } from "./components/Toolbar";
import { ObjectBar } from "./components/ObjectBar";
import { StatusBar } from "./components/StatusBar";
import { Toolbox } from "./components/Toolbox";
import { Ruler } from "./components/Ruler";
import { ViewBar } from "./components/ViewBar";
import { PrintDialog } from "./components/PrintDialog";
import { FindReplace } from "./components/FindReplace";
import { UpgradeDialog } from "./components/UpgradeDialog";
import { SettingsDialog } from "./components/SettingsDialog";
import { OcrDialog } from "./components/OcrDialog";
import { KeyboardHelp } from "./components/KeyboardHelp";
import { SelectionMenu } from "./editor/SelectionMenu";
import { PageCanvas } from "./editor/PageCanvas";
import { AiPanel } from "./components/AiPanel";
import { TooltipProvider } from "./components/ui/tooltip";
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
      <div className="editor-shell flex h-full flex-col" dir="ltr">
        <a href="#document-canvas" className="sr-only focus:not-sr-only">Skip to document</a>
        <MenuBar />
        <Toolbar />
        <ParagraphBar />
        {showObjectBar && <ObjectBar />}
        <FindReplace />

        <div className="flex min-h-0 flex-1">
          <Toolbox />

          {/* Canvas column: view bar + scrollable page area */}
          <div className="relative flex min-w-0 flex-1 flex-col">
            <ViewBar />
            <main id="document-canvas" tabIndex={-1} aria-label="Document canvas" className="canvas-workspace relative flex-1 overflow-auto bg-paper-edge">
              <CanvasStage pages={pages} />

            </main>
          </div>

          {/* Collapsible AI panel */}
          <div hidden={!aiOpen} className="assistant-host" style={{ display: aiOpen ? undefined : "none" }}>
            <div className="relative flex h-full w-full flex-col bg-surface">
              <button
                onClick={toggleAi}
                title="Close writing assistant" aria-label="Close writing assistant"
                className="absolute left-2 top-2.5 z-10 rounded-md p-1 text-ink-soft hover:bg-paper-edge"
              >
                <PanelRightClose size={18} />
              </button>
              <AiPanel />
            </div>
          </div>
        </div>

        <StatusBar />
        <PrintDialog />
        <UpgradeDialog />
        <SettingsDialog />
        <OcrDialog />
        <KeyboardHelp />
        <SelectionMenu />
      </div>
    </TooltipProvider>
  );
}

/** Renders ALL pages stacked vertically (continuous document), zoomable. */
function CanvasStage({ pages }: { pages: ReturnType<typeof useDoc.getState>["pages"] }) {
  const zoom = useUi((s) => s.zoom);
  const setActivePage = useDoc((s) => s.setActivePage);
  const pageW = pages[0]?.width ?? 794;

  return (
    <div className="canvas-stage flex min-w-full w-max flex-col items-center gap-0 px-8 py-6">
      <div style={{ width: pageW * zoom }}>
        <Ruler pageWidth={pageW} />
      </div>

      {pages.map((page, i) => (
        <div key={page.id} className="flex flex-col items-center">
          <div
            style={{ width: page.width * zoom, height: page.height * zoom }}
            className="mt-3"
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
