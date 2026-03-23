"use client";

import { useState } from "react";
import ReactDiffViewer, { DiffMethod } from "react-diff-viewer-continued";
import { Button } from "@/components/ui/button";

interface ApprovalDiffViewerProps {
  oldContent: string;
  newContent: string;
  containerWidth?: number;
}

export function ApprovalDiffViewer({
  oldContent,
  newContent,
  containerWidth,
}: ApprovalDiffViewerProps) {
  // Default to unified view for narrow containers (Sheet drawer < 600px)
  const [splitView, setSplitView] = useState(
    containerWidth ? containerWidth >= 600 : false
  );

  return (
    <div>
      <div className="flex justify-end mb-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSplitView(!splitView)}
        >
          {splitView ? "Unified view" : "Split view"}
        </Button>
      </div>
      <div className="max-h-[400px] overflow-y-auto rounded-md border">
        <ReactDiffViewer
          oldValue={oldContent}
          newValue={newContent}
          splitView={splitView}
          compareMethod={DiffMethod.WORDS}
          leftTitle="Current Prompt"
          rightTitle="Proposed Changes"
          useDarkTheme={false}
          styles={{
            contentText: {
              fontFamily: "var(--font-mono), ui-monospace, monospace",
              fontSize: "13px",
              lineHeight: "1.5",
            },
            gutter: {
              fontFamily: "var(--font-mono), ui-monospace, monospace",
              fontSize: "12px",
            },
            titleBlock: {
              fontFamily: "var(--font-sans), ui-sans-serif, sans-serif",
              fontSize: "14px",
              fontWeight: 600,
            },
          }}
        />
      </div>
    </div>
  );
}
