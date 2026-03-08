"use client";

export function WritingIndicator() {
  return (
    <div className="flex items-center gap-1 px-4 py-2.5 min-w-[80px]">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block size-1.5 rounded-full bg-current opacity-40 animate-bounce"
          style={{ animationDelay: `${i * 150}ms`, animationDuration: "0.9s" }}
        />
      ))}
    </div>
  );
}
