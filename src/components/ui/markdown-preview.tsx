"use client";

import { cn } from "@/lib/utils";

interface MarkdownPreviewProps {
  children: string;
  className?: string;
}

/**
 * Lightweight markdown renderer (no external deps).
 * Supports: headings, bold, italic, strikethrough, inline code,
 *           unordered/ordered lists, blockquotes, code blocks.
 */
export function MarkdownPreview({ children, className }: MarkdownPreviewProps) {
  const lines = children.split("\n");
  const nodes: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (line.startsWith("```")) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      nodes.push(
        <pre key={i} className="rounded bg-muted px-3 py-2 text-xs font-mono overflow-x-auto my-1">
          <code>{codeLines.join("\n")}</code>
        </pre>
      );
      i++;
      continue;
    }

    // Headings
    const h1 = line.match(/^# (.+)/);
    if (h1) { nodes.push(<h1 key={i} className="text-2xl font-bold mb-1">{inline(h1[1])}</h1>); i++; continue; }
    const h2 = line.match(/^## (.+)/);
    if (h2) { nodes.push(<h2 key={i} className="text-base font-semibold mt-2">{inline(h2[1])}</h2>); i++; continue; }
    const h3 = line.match(/^### (.+)/);
    if (h3) { nodes.push(<h3 key={i} className="text-sm font-semibold mt-1.5">{inline(h3[1])}</h3>); i++; continue; }

    // Blockquote
    if (line.startsWith("> ")) {
      nodes.push(
        <blockquote key={i} className="border-l-2 border-border pl-3 text-muted-foreground my-0.5">
          {inline(line.slice(2))}
        </blockquote>
      );
      i++; continue;
    }

    // Unordered list — collect consecutive items
    if (line.match(/^[-*+] /)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && lines[i].match(/^[-*+] /)) {
        items.push(<li key={i}>{inline(lines[i].slice(2))}</li>);
        i++;
      }
      nodes.push(<ul key={`ul-${i}`} className="list-disc pl-5 my-0.5">{items}</ul>);
      continue;
    }

    // Ordered list — collect consecutive items
    if (line.match(/^\d+\. /)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && lines[i].match(/^\d+\. /)) {
        items.push(<li key={i}>{inline(lines[i].replace(/^\d+\. /, ""))}</li>);
        i++;
      }
      nodes.push(<ol key={`ol-${i}`} className="list-decimal pl-5 my-0.5">{items}</ol>);
      continue;
    }

    // Empty line — skip
    if (line.trim() === "") { i++; continue; }

    // Paragraph
    nodes.push(<p key={i} className="my-0.5">{inline(line)}</p>);
    i++;
  }

  return (
    <div className={cn("text-sm", className)}>
      {nodes}
    </div>
  );
}

/** Render inline markdown: bold, italic, strikethrough, code */
function inline(text: string): React.ReactNode {
  // Split on inline markers, preserving the tokens
  const parts = text.split(/(\*\*[^*]+\*\*|__[^_]+__|_[^_]+_|\*[^*]+\*|~~[^~]+~~|`[^`]+`)/);
  return parts.map((part, idx) => {
    if (/^\*\*[^*]+\*\*$/.test(part) || /^__[^_]+__$/.test(part)) {
      return <strong key={idx}>{part.slice(2, -2)}</strong>;
    }
    if (/^_[^_]+_$/.test(part) || /^\*[^*]+\*$/.test(part)) {
      return <em key={idx}>{part.slice(1, -1)}</em>;
    }
    if (/^~~[^~]+~~$/.test(part)) {
      return <del key={idx}>{part.slice(2, -2)}</del>;
    }
    if (/^`[^`]+`$/.test(part)) {
      return <code key={idx} className="rounded bg-muted px-1 py-0.5 font-mono text-xs">{part.slice(1, -1)}</code>;
    }
    return part;
  });
}
