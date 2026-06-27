import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";

export function Markdown({ children }: { children: string }) {
  return (
    <div className="markdown-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]} components={{
        a: ({ href, children: linkChildren }) => <a href={href} target="_blank" rel="noreferrer">{linkChildren}</a>,
      }}>{children}</ReactMarkdown>
    </div>
  );
}
