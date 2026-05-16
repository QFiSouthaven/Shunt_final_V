
import React from 'react';
import Mermaid from './Mermaid';
import DOMPurify from 'dompurify';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';

interface MarkdownRendererProps {
  content: string | undefined | null;
}

// Strict Allow-list for DOMPurify to prevent XSS (P0 Priority)
const PURIFY_CONFIG = {
    ALLOWED_TAGS: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'div', 'ul', 'ol', 'li', 'b', 'i', 'strong', 'em', 'code', 'pre', 'br', 'hr', 'blockquote', 'a', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'del', 'input'],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'target', 'type', 'checked', 'disabled', 'start', 'id'],
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'button', 'style'],
};

// Hook to ensure links open in new tabs securely (prevent tabnabbing)
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if ('target' in node && node.getAttribute('target') === '_blank') {
        node.setAttribute('rel', 'noopener noreferrer');
    }
});

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
    if (typeof content !== 'string') {
        if (content === null || content === undefined) return null;
        return <div className="text-gray-500 italic">Invalid content type: {typeof content}</div>;
    }

    if (!content.trim()) return null;

    try {
        // Sanitize first to prevent passing malicious HTML structure into react-markdown -> rehype-raw
        const safeMarkdown = DOMPurify.sanitize(content, PURIFY_CONFIG);
        
        return (
            <div className="prose prose-invert prose-sm max-w-none">
                <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeRaw]}
                    components={{
                        code(props) {
                            const { children, className, node, ...rest } = props;
                            const match = /language-(\w+)/.exec(className || '');
                            const language = match ? match[1] : '';
                            
                            // Determine if it's block-level by checking if it contains newlines or has a language
                            // In standard markdown handling with rehype, code blocks are wrapped in <pre><code>.
                            // react-markdown passes node references to help identify context.
                            const hasNewlines = String(children).includes('\n');
                            const isBlock = Boolean(match || hasNewlines || (node?.position && node.position.start.line !== node.position.end.line));

                            if (isBlock && language === 'mermaid') {
                                return (
                                    <div className="my-4 not-prose bg-gray-900/50 p-4 rounded-lg flex justify-center">
                                        <Mermaid chart={String(children).replace(/\n$/, '')} />
                                    </div>
                                );
                            }

                            if (isBlock) {
                                return (
                                    <div className="bg-black/50 rounded-lg my-4 not-prose">
                                        {language && <div className="text-xs text-gray-400 px-4 py-2 border-b border-gray-600/50">{language}</div>}
                                        <pre className="p-4 text-sm text-gray-200 overflow-x-auto whitespace-pre-wrap font-mono">
                                            <code className={className} {...rest}>
                                                {children}
                                            </code>
                                        </pre>
                                    </div>
                                );
                            }

                            return <code className={className} {...rest}>{children}</code>;
                        },
                        a: ({ node, ...props }) => {
                            // Enforce secure links on standard links processed by react-markdown
                            return <a {...props} target="_blank" rel="noopener noreferrer" />;
                        }
                    }}
                >
                    {safeMarkdown}
                </ReactMarkdown>
            </div>
        );
    } catch (e) {
        console.error("Critical Markdown Renderer Failure:", e);
        return (
            <div className="p-4 bg-red-900/20 border border-red-500/50 rounded text-gray-300">
                <p className="font-bold text-red-400 mb-2">Renderer Crashed</p>
                <div className="whitespace-pre-wrap font-mono text-xs overflow-auto max-h-40">{content}</div>
            </div>
        );
    }
};

export default React.memo(MarkdownRenderer);
