

import React from 'react';
import { SparklesIcon, ErrorIcon, TerminalIcon } from '../icons';
import MarkdownRenderer from '../common/MarkdownRenderer';
import CodeBlock from './CodeBlock';
import Loader from '../Loader';

interface ChatMessageProps {
  role: 'user' | 'model' | 'error' | 'system-progress' | 'code-output';
  content: string;
  isLoading?: boolean;
  onExecuteCode?: (language: string, code: string) => void;
}

const TypingIndicator: React.FC = () => (
  <div className="flex items-center space-x-1">
    <span className="w-2 h-2 bg-fuchsia-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
    <span className="w-2 h-2 bg-fuchsia-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
    <span className="w-2 h-2 bg-fuchsia-400 rounded-full animate-bounce"></span>
  </div>
);

const ChatMessage: React.FC<ChatMessageProps> = ({ role, content, isLoading, onExecuteCode }) => {
  const isUser = role === 'user';
  const isModel = role === 'model';
  const isError = role === 'error';
  const isSystemProgress = role === 'system-progress';
  const isCodeOutput = role === 'code-output';

  if (isSystemProgress) {
      return (
          <div className="flex items-center justify-center gap-2 text-sm text-gray-400 italic">
              <Loader />
              <span>{content}</span>
          </div>
      );
  }
  
  if (isCodeOutput) {
      return (
        <div className="flex items-start gap-3 justify-center">
            <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center border bg-gray-900/50 border-gray-600 mt-7">
                <TerminalIcon className="w-5 h-5 text-green-400" />
            </div>
            <div className="flex flex-col w-full max-w-xl">
                 <div className="font-semibold text-sm text-gray-400 mb-1 px-2">Code Output</div>
                 <div className="bg-black/80 border border-gray-700 rounded-lg p-4 font-mono text-sm text-gray-300 whitespace-pre-wrap">
                    <code>{content}</code>
                 </div>
            </div>
        </div>
      );
  }

  const wrapperClasses = `flex items-start gap-3 ${isUser ? 'justify-end' : ''}`;
  
  const bubbleClasses = `max-w-xl rounded-2xl shadow-md ${
    isUser
      ? 'bg-fuchsia-600 text-white rounded-br-lg'
      : isError
      ? 'bg-red-900/50 border border-red-700/80 text-red-300 rounded-bl-lg p-4'
      : 'bg-gray-700 text-gray-200 rounded-bl-lg' 
  } ${ isModel ? 'p-0' : 'p-4'}`; // No padding for model to allow code blocks to be flush
  
  const author = isUser ? 'You' : isError ? 'System Error' : 'AI';

  // Parse content for code blocks
  const contentParts = content.split(/(```[\s\S]*?```)/g);

  return (
    <div className={wrapperClasses}>
      {!isUser && (
        <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center border ${isError ? 'bg-red-900/50 border-red-700' : 'bg-gray-900/50 border-gray-600'}`}>
          {isError ? <ErrorIcon className="w-5 h-5 text-red-400" /> : <SparklesIcon className="w-5 h-5 text-fuchsia-400" />}
        </div>
      )}
      <div className="flex flex-col">
        <div className="font-semibold text-sm text-gray-400 mb-1 px-2">{isUser ? '' : author}</div>
        <div className={bubbleClasses}>
            {isLoading && !content ? <div className="p-4"><TypingIndicator /></div> : (
              isModel ? (
                <div>
                  {contentParts.map((part, index) => {
                    if (part.startsWith('```') && part.endsWith('```')) {
                      const codeBlock = part.slice(3, -3);
                      const languageMatch = codeBlock.match(/^[a-z]+\n/);
                      const language = languageMatch ? languageMatch[0].trim() : '';
                      const code = language ? codeBlock.substring(codeBlock.indexOf('\n') + 1) : codeBlock;
                      return <CodeBlock key={index} language={language} code={code} onExecute={onExecuteCode} />;
                    }
                    if(part.trim()){
                       return <div className="p-4" key={index}><MarkdownRenderer content={part} /></div>;
                    }
                    return null;
                  })}
                </div>
              ) : (
                <MarkdownRenderer content={content} />
              )
            )}
        </div>
      </div>
    </div>
  );
};

export default React.memo(ChatMessage);