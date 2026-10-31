// Safe markdown (no raw HTML) for chat bubbles. Lazy-loaded with the playground only.
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CopyButton, cn } from './core.jsx';

function Pre({ children }) {
  const code = children?.props?.children;
  const text = Array.isArray(code) ? code.join('') : String(code ?? '');
  const lang = /language-(\w+)/.exec(children?.props?.className || '')?.[1];
  return (
    <div className="group relative">
      <div className="absolute end-1.5 top-1.5 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        {lang && <span className="rounded-md bg-solid/80 px-1.5 py-0.5 font-mono text-[10.5px] text-muted">{lang}</span>}
        <CopyButton text={text.replace(/\n$/, '')} className="bg-solid/80" />
      </div>
      <pre>{children}</pre>
    </div>
  );
}

export default function Markdown({ children, className }) {
  return (
    <div dir="auto" className={cn('prose-chat', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{ pre: Pre, a: (p) => <a {...p} target="_blank" rel="noopener noreferrer" /> }}>
        {children || ''}
      </ReactMarkdown>
    </div>
  );
}
