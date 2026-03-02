"use client";

import { useState, useEffect } from "react";
import { TextSegment } from "@/components/chat/TextSegment";
import { ToolCallStrip } from "@/components/chat/ToolCallStrip";
import { ChatAskWidget } from "@/components/ChatAskWidget";
import { ChatFormWidget } from "@/components/ChatFormWidget";
import type { ChatMessage, Block, ToolBlock } from "@/lib/types";

interface BlockListProps {
  message: ChatMessage;
  color: string;
  onChatAskSubmit?: (requestId: string, value: string, messageId: string) => void;
}

interface ToolGroup {
  kind: "toolgroup";
  toolCalls: ToolBlock[];
  startIndex: number;
}
interface OtherBlock {
  kind: "other";
  block: Block;
  index: number;
}
type GroupedItem = ToolGroup | OtherBlock;

function groupBlocks(blocks: Block[]): GroupedItem[] {
  const result: GroupedItem[] = [];
  let i = 0;
  while (i < blocks.length) {
    const block = blocks[i];
    if (block.type === "tool") {
      const name = block.name;
      const group: ToolBlock[] = [block];
      let j = i + 1;
      while (j < blocks.length && blocks[j].type === "tool" && (blocks[j] as ToolBlock).name === name) {
        group.push(blocks[j] as ToolBlock);
        j++;
      }
      result.push({ kind: "toolgroup", toolCalls: group, startIndex: i });
      i = j;
    } else {
      result.push({ kind: "other", block, index: i });
      i++;
    }
  }
  return result;
}

export function BlockList({ message, color, onChatAskSubmit }: BlockListProps) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  // Auto-expand error tool blocks when they arrive
  useEffect(() => {
    message.blocks.forEach((b, i) => {
      if (b.type === "tool" && b.status === "error") {
        setExpanded((prev) => {
          if (prev.has(i)) return prev;
          const next = new Set(prev);
          next.add(i);
          return next;
        });
      }
    });
  }, [message.blocks]);

  const toggle = (i: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  const grouped = groupBlocks(message.blocks);
  const totalBlocks = message.blocks.length;

  return (
    <>
      {grouped.map((item) => {
        if (item.kind === "other") {
          const { block, index } = item;
          const isLast = index === totalBlocks - 1;
          if (block.type === "text") {
            return (
              <TextSegment
                key={index}
                content={block.content}
                showCursor={isLast && !message.done}
                color={color}
              />
            );
          }
          if (block.type === "chat_ask") {
            return (
              <ChatAskWidget
                key={index}
                block={block}
                onSubmit={(requestId, value) =>
                  onChatAskSubmit?.(requestId, value, message.id)
                }
              />
            );
          }
          if (block.type === "chat_form") {
            return (
              <ChatFormWidget
                key={index}
                block={block}
                onSubmit={(requestId, value) =>
                  onChatAskSubmit?.(requestId, value, message.id)
                }
              />
            );
          }
          return null;
        }

        const { toolCalls, startIndex } = item;
        return (
          <ToolCallStrip
            key={startIndex}
            toolCalls={toolCalls}
            expanded={expanded.has(startIndex)}
            onToggle={() => toggle(startIndex)}
          />
        );
      })}
    </>
  );
}
