"use client";

import { ChevronDownIcon, XIcon } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import type { ToolBlock } from "@/lib/types";

interface ToolCallStripProps {
  toolCalls: ToolBlock[];
  expanded: boolean;
  onToggle: () => void;
}

export function ToolCallStrip({ toolCalls, expanded, onToggle }: ToolCallStripProps) {
  const count = toolCalls.length;

  // Group status: running if any running, error if any error, else done
  const isRunning = toolCalls.some((t) => t.status === "running");
  const isError = !isRunning && toolCalls.some((t) => t.status === "error");
  const isDone = !isRunning && !isError;

  const hasDetails = toolCalls.some((t) => {
    const notRunning = t.status !== "running";
    return notRunning && ((t.args && Object.keys(t.args).length > 0) || typeof t.result === "string");
  });

  const containerClass = "border-zinc-200 bg-zinc-50 dark:border-zinc-700/60 dark:bg-zinc-900/50";

  const icon = isError ? (
    <XIcon className="size-3 text-zinc-400 dark:text-zinc-500" />
  ) : isDone ? (
    <span className="text-zinc-400 dark:text-zinc-500 text-[11px] font-bold">✓</span>
  ) : (
    <Spinner className="size-3 text-zinc-400 dark:text-zinc-500" />
  );

  const labelClass = "text-zinc-700 dark:text-zinc-300";
  const statusText = isError ? "error" : isDone ? "done" : "running…";
  const statusColor = isError
    ? "text-red-400 dark:text-red-500"
    : "text-zinc-400 dark:text-zinc-500";
  const outputClass = "text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-900/80";

  return (
    <div className={`rounded-lg border text-xs font-mono transition-colors ${containerClass}`}>
      <div
        className={`flex items-center gap-2 px-3 py-2 ${hasDetails ? "cursor-pointer select-none hover:bg-zinc-800/30 rounded-lg transition-colors" : ""}`}
        onClick={hasDetails ? onToggle : undefined}
      >
        {icon}
        <span className={`font-medium tracking-tight ${labelClass}`}>{toolCalls[0].name}</span>
        {count > 1 && (
          <span className="text-[10px] text-zinc-400 dark:text-zinc-500">×{count}</span>
        )}
        <span className={`text-[10px] ml-0.5 ${statusColor}`}>{statusText}</span>
        {hasDetails && (
          <ChevronDownIcon
            className={`size-3 text-zinc-500 ml-auto transition-transform duration-150 ${expanded ? "rotate-180" : ""}`}
          />
        )}
      </div>
      {hasDetails && expanded && (
        <div className="border-t border-black/10 dark:border-white/10 px-3 pb-3 space-y-4">
          {toolCalls.map((toolCall, idx) => {
            const hasArgs = toolCall.status !== "running" && toolCall.args && Object.keys(toolCall.args).length > 0;
            const hasResult = toolCall.status !== "running" && typeof toolCall.result === "string";
            if (!hasArgs && !hasResult) return null;
            return (
              <div key={idx} className="pt-2 space-y-2.5">
                {count > 1 && (
                  <div className="text-[10px] uppercase tracking-widest text-zinc-400 dark:text-zinc-600">
                    #{idx + 1}
                  </div>
                )}
                {hasArgs && (
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-zinc-500 dark:text-zinc-500 mb-1.5">
                      Input
                    </div>
                    <pre className="text-[11px] text-zinc-700 dark:text-zinc-300 bg-black/5 dark:bg-zinc-950/60 rounded-md px-2.5 py-2 overflow-x-auto leading-relaxed">
                      {JSON.stringify(toolCall.args, null, 2)}
                    </pre>
                  </div>
                )}
                {hasResult && (
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-zinc-500 dark:text-zinc-500 mb-1.5">
                      Output
                    </div>
                    <pre
                      className={`text-[11px] rounded-md px-2.5 py-2 overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap leading-relaxed ${outputClass}`}
                    >
                      {toolCall.result || "(empty)"}
                    </pre>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
