"use client";

import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { CopyButton } from "@/components/CopyButton";
import type { ChatMessage } from "@/lib/types";

function renderUserText(
  text: string,
  onAgentClick: (id: string) => void
): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const regex = /(?<![^\s])(@[a-zA-Z0-9_-]+|#[a-zA-Z0-9_-]+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const token = m[0];
    if (token.startsWith("@")) {
      const agentId = token.slice(1);
      parts.push(
        <button
          key={m.index}
          onClick={() => onAgentClick(agentId)}
          className="text-sky-400 hover:text-sky-300 hover:underline transition-colors cursor-pointer"
        >
          {token}
        </button>
      );
    } else {
      parts.push(
        <span
          key={m.index}
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-400 text-xs font-medium"
        >
          {token}
        </span>
      );
    }
    last = m.index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

interface UserBubbleProps {
  message: ChatMessage;
}

export function UserBubble({ message }: UserBubbleProps) {
  const router = useRouter();
  const raw =
    message.blocks[0]?.type === "text" ? message.blocks[0].content : "";
  const knowledgeSentinel = "\n\n---\n[Knowledge:";
  const sentinelIndex = raw.indexOf(knowledgeSentinel);
  const text = sentinelIndex !== -1 ? raw.slice(0, sentinelIndex) : raw;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className={cn("group/user flex justify-end py-0.5 gap-1.5 items-center", message.queued && "opacity-50")}
    >
      {message.queued && <Clock className="size-3 text-muted-foreground shrink-0" />}
      <div className="opacity-0 group-hover/user:opacity-100 transition-opacity self-start pt-1">
        <CopyButton
          value={text}
          className="text-muted-foreground hover:text-foreground"
        />
      </div>
      <div className="bg-primary text-primary-foreground rounded-2xl rounded-br-sm px-4 py-2.5 max-w-[75%] text-sm leading-relaxed shadow-sm whitespace-pre-wrap break-words">
        {renderUserText(text, (id) => router.push(`/agents?id=${id}`))}
      </div>
    </motion.div>
  );
}
