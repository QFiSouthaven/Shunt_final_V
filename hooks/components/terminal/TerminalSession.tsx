
// components/terminal/TerminalSession.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { executeCommand } from './terminalUtils';

interface OutputLine {
    id: number;
    text: string | React.ReactNode;
}

const TerminalSession: React.FC = () => {
    const [input, setInput] = useState('');
    const [output, setOutput] = useState<OutputLine[]>([]);
    const [history, setHistory] = useState<string[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const [currentPath, setCurrentPath] = useState('~');
    const inputRef = useRef<HTMLInputElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    const welcomeMessage = 'Welcome to Aether Shunt Terminal. Type `help` for a list of commands.';
    useEffect(() => {
        setOutput([{ id: Date.now(), text: welcomeMessage }]);
    }, []);
    
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [output]);

    const handleCommand = useCallback(async (command: string) => {
        const newOutput: OutputLine[] = [...output, { id: Date.now(), text: <><span className="terminal-prompt">user@aether:<span className="terminal-path">{currentPath}</span>$</span> {command}</> }];
        
        // Optimistic update to show command immediately
        setOutput(newOutput);

        try {
            const result = await executeCommand(command, currentPath);
            
            if (result.output) {
                const resultLines = result.output.split('\n').map((line, index) => ({
                    id: Date.now() + index + 1,
                    text: line,
                }));
                newOutput.push(...resultLines);
            }

            if (result.newPath) {
                setCurrentPath(result.newPath);
            }

            if (result.clear) {
                setOutput([{ id: Date.now(), text: welcomeMessage }]);
            } else {
                setOutput([...newOutput]);
            }
        } catch (error) {
             newOutput.push({ id: Date.now() + 1, text: `Error executing command: ${error}` });
             setOutput([...newOutput]);
        }

        if (command) {
            setHistory(prev => [command, ...prev]);
        }
        setHistoryIndex(-1);
    }, [output, currentPath, welcomeMessage]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            handleCommand(input);
            setInput('');
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (historyIndex < history.length - 1) {
                const newIndex = historyIndex + 1;
                setHistoryIndex(newIndex);
                setInput(history[newIndex]);
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (historyIndex > 0) {
                const newIndex = historyIndex - 1;
                setHistoryIndex(newIndex);
                setInput(history[newIndex]);
            } else {
                setHistoryIndex(-1);
                setInput('');
            }
        } else if (e.key === 'l' && e.ctrlKey) {
            e.preventDefault();
            setOutput([{ id: Date.now(), text: welcomeMessage }]);
        }
    };

    return (
        <div
            className="terminal-container"
            onClick={() => inputRef.current?.focus()}
        >
            <div ref={scrollRef} className="terminal-output">
                {output.map(line => (
                    <div key={line.id} className="whitespace-pre-wrap break-words">{line.text}</div>
                ))}
                <div className="terminal-input-line">
                    <span className="terminal-prompt">user@aether:<span className="terminal-path">{currentPath}</span>$</span>
                    <input
                        ref={inputRef}
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        className="terminal-input"
                        autoFocus
                        spellCheck="false"
                    />
                    <span className="terminal-cursor"></span>
                </div>
            </div>
        </div>
    );
};

export default TerminalSession;
