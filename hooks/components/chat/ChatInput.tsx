import React, { useState, KeyboardEvent, useRef, useEffect } from 'react';
import { PaperAirplaneIcon } from '../icons';

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  isLoading: boolean;
}

const ChatInput: React.FC<ChatInputProps> = ({ onSendMessage, isLoading }) => {
  const [message, setMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${scrollHeight}px`;
    }
  }, [message]);

  const handleSendMessage = () => {
    if (message.trim() && !isLoading) {
      onSendMessage(message.trim());
      setMessage('');
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleSendMessage();
      }}
      className="flex items-start gap-3 bg-gray-700/50 border border-gray-600/50 rounded-lg p-2"
    >
      <textarea
        ref={textareaRef}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type your message here..."
        className="flex-grow bg-transparent text-gray-200 placeholder-gray-400 resize-none focus:outline-none p-2 max-h-40"
        rows={1}
        disabled={isLoading}
      />
      <button
        type="submit"
        disabled={isLoading || !message.trim()}
        className="flex-shrink-0 w-10 h-10 bg-fuchsia-600 text-white rounded-md flex items-center justify-center transition-colors hover:bg-fuchsia-500 disabled:bg-gray-600 disabled:cursor-not-allowed self-end"
        aria-label="Send message"
      >
        <PaperAirplaneIcon className="w-5 h-5" />
      </button>
    </form>
  );
};

export default ChatInput;