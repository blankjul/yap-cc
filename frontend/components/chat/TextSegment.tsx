"use client";

import { MarkdownContent } from "@/components/MarkdownContent";
import { CopyButton } from "@/components/CopyButton";
import { cn } from "@/lib/utils";

interface TextSegmentProps {
  content: string;
  showCursor: boolean;
  color: string;
}

export function TextSegment({ content, showCursor, color }: TextSegmentProps) {
  return (
    <div className="group/seg relative">
      <div
        style={{ backgroundColor: color + "18" }}
        className={cn(
          "w-full text-foreground rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm leading-relaxed shadow-sm",
          showCursor && "min-w-[180px]"
        )}
      >
        <MarkdownContent content={content} showCursor={showCursor} />
      </div>
      {!showCursor && (
        <div className="absolute top-1 -right-7 opacity-0 group-hover/seg:opacity-100 transition-opacity">
          <CopyButton
            value={content}
            className="text-muted-foreground hover:text-foreground"
          />
        </div>
      )}
    </div>
  );
}
