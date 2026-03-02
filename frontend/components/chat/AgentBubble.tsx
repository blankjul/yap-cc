"use client";

import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { SendIcon } from "lucide-react";
import { AgentAvatar } from "@/components/AgentAvatar";
import { BlockList } from "@/components/chat/BlockList";
import { WritingIndicator } from "@/components/chat/WritingIndicator";
import type { ChatMessage } from "@/lib/types";

interface AgentBubbleProps {
  message: ChatMessage;
  color: string;
  name?: string;
  onChatAskSubmit?: (requestId: string, value: string, messageId: string) => void;
}

export function AgentBubble({ message, color, name, onChatAskSubmit }: AgentBubbleProps) {
  const router = useRouter();
  const agentId = message.agentId ?? "agent";
  const displayName = name || agentId;
  const isWriting = !message.done;
  const isUserAgent = agentId === "user-agent";
  const isTelegram = agentId === "telegram";

  const goToAgent = () => router.push(`/agents?id=${agentId}`);

  if (isTelegram) {
    const TELEGRAM_BLUE = "#2AABEE";
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        className="flex flex-col items-start gap-0.5 py-0.5"
      >
        <div className="flex items-center gap-1.5 pl-9 mb-0.5">
          <span className="text-xs font-medium" style={{ color: TELEGRAM_BLUE }}>Telegram</span>
          {isWriting && <span className="text-xs text-muted-foreground/60 italic">writing…</span>}
        </div>
        <div className="flex items-start gap-2">
          <div
            className="shrink-0 mt-0.5 size-7 rounded-full flex items-center justify-center text-white"
            style={{ backgroundColor: TELEGRAM_BLUE }}
          >
            <SendIcon className="size-3.5 -rotate-12" />
          </div>
          <div className="flex flex-col gap-1.5 w-full max-w-[75%]">
            {message.blocks.length === 0 && isWriting ? (
              <div
                className="rounded-2xl rounded-bl-sm shadow-sm px-3 py-2"
                style={{ backgroundColor: TELEGRAM_BLUE + "18" }}
              >
                <WritingIndicator />
              </div>
            ) : (
              <BlockList
                message={message}
                color={TELEGRAM_BLUE}
                onChatAskSubmit={onChatAskSubmit}
              />
            )}
          </div>
        </div>
      </motion.div>
    );
  }

  if (isUserAgent) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        className="flex flex-col items-end gap-0.5 py-0.5"
      >
        <div className="flex items-center gap-1.5 pr-9 mb-0.5">
          {isWriting && (
            <span className="text-xs text-muted-foreground/60 italic">writing…</span>
          )}
          <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
            You (Auto)
          </span>
        </div>
        <div className="flex items-start gap-2 flex-row-reverse">
          <div className="shrink-0 mt-0.5 size-7 rounded-full bg-amber-500 flex items-center justify-center text-white text-xs font-bold">
            U
          </div>
          <div className="flex flex-col gap-1.5 w-full max-w-[75%] items-end">
            {message.blocks.length === 0 && isWriting ? (
              <div className="rounded-2xl rounded-br-sm shadow-sm bg-amber-500/18 px-3 py-2">
                <WritingIndicator />
              </div>
            ) : (
              <BlockList
                message={message}
                color="#f59e0b"
                onChatAskSubmit={onChatAskSubmit}
              />
            )}
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className="flex flex-col items-start gap-0.5 py-0.5"
    >
      <div className="flex items-center gap-1.5 pl-9 mb-0.5">
        <button
          onClick={goToAgent}
          className="text-xs text-muted-foreground hover:text-foreground hover:underline transition-colors"
          title={`@${agentId}`}
        >
          {displayName}
        </button>
        {isWriting && (
          <span className="text-xs text-muted-foreground/60 italic">writing…</span>
        )}
      </div>
      <div className="flex items-start gap-2">
        <button
          onClick={goToAgent}
          className="shrink-0 mt-0.5 rounded-full focus:outline-none hover:ring-2 hover:ring-offset-1 hover:ring-border transition-all"
        >
          <AgentAvatar agentId={agentId} color={color} className="size-7" />
        </button>
        <div className="flex flex-col gap-1.5 w-full max-w-[75%]">
          {message.blocks.length === 0 && isWriting ? (
            <div
              style={{ backgroundColor: color + "18" }}
              className="rounded-2xl rounded-bl-sm shadow-sm"
            >
              <WritingIndicator />
            </div>
          ) : (
            <BlockList
              message={message}
              color={color}
              onChatAskSubmit={onChatAskSubmit}
            />
          )}
        </div>
      </div>
    </motion.div>
  );
}
