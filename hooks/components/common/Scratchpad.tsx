import React, { useState, useRef, useEffect, useCallback } from 'react';
import { XMarkIcon, MinusIcon, AmplifyIcon, ClipboardDocumentListIcon, UploadIcon } from '../icons';

interface ScratchpadProps {
    isVisible: boolean;
    onClose: () => void;
    isMinimized: boolean;
    onToggleMinimize: () => void;
    position: { x: number; y: number };
    onDrag: (pos: { x: number; y: number }) => void;
    content: string;
    onContentChange: (content: string) => void;
    boundsRef: React.RefObject<HTMLDivElement>;
    onAttach: (content: string) => void;
}

const Scratchpad: React.FC<ScratchpadProps> = ({
    isVisible,
    onClose,
    isMinimized,
    onToggleMinimize,
    position,
    onDrag,
    content,
    onContentChange,
    boundsRef,
    onAttach
}) => {
    const [isDragging, setIsDragging] = useState(false);
    const dragOffset = useRef({ x: 0, y: 0 });
    const nodeRef = useRef<HTMLDivElement>(null);

    const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!nodeRef.current) return;
        setIsDragging(true);
        const rect = nodeRef.current.getBoundingClientRect();
        dragOffset.current = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
        };
        // Prevent text selection while dragging
        e.preventDefault();
    };

    const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
        if (!nodeRef.current) return;
        setIsDragging(true);
        const touch = e.touches[0];
        const rect = nodeRef.current.getBoundingClientRect();
        dragOffset.current = {
            x: touch.clientX - rect.left,
            y: touch.clientY - rect.top,
        };
    };

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!isDragging || !boundsRef.current || !nodeRef.current) return;

        const boundsRect = boundsRef.current.getBoundingClientRect();
        const nodeRect = nodeRef.current.getBoundingClientRect();

        let newX = e.clientX - dragOffset.current.x - boundsRect.left;
        let newY = e.clientY - dragOffset.current.y - boundsRect.top;

        // Constrain movement within the bounds
        newX = Math.max(0, Math.min(newX, boundsRect.width - nodeRect.width));
        newY = Math.max(0, Math.min(newY, boundsRect.height - nodeRect.height));

        onDrag({ x: newX, y: newY });
    }, [isDragging, boundsRef, onDrag]);
    
    const handleTouchMove = useCallback((e: TouchEvent) => {
        if (!isDragging || !boundsRef.current || !nodeRef.current) return;
        e.preventDefault();

        const touch = e.touches[0];
        const boundsRect = boundsRef.current.getBoundingClientRect();
        const nodeRect = nodeRef.current.getBoundingClientRect();

        let newX = touch.clientX - dragOffset.current.x - boundsRect.left;
        let newY = touch.clientY - dragOffset.current.y - boundsRect.top;
        
        newX = Math.max(0, Math.min(newX, boundsRect.width - nodeRect.width));
        newY = Math.max(0, Math.min(newY, boundsRect.height - nodeRect.height));

        onDrag({ x: newX, y: newY });
    }, [isDragging, boundsRef, onDrag]);

    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
    }, []);

    const handleTouchEnd = useCallback(() => {
        setIsDragging(false);
    }, []);

    useEffect(() => {
        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
            window.addEventListener('touchmove', handleTouchMove, { passive: false });
            window.addEventListener('touchend', handleTouchEnd);
        } else {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            window.removeEventListener('touchmove', handleTouchMove);
            window.removeEventListener('touchend', handleTouchEnd);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            window.removeEventListener('touchmove', handleTouchMove);
            window.removeEventListener('touchend', handleTouchEnd);
        };
    }, [isDragging, handleMouseMove, handleMouseUp, handleTouchMove, handleTouchEnd]);


    if (!isVisible) return null;

    return (
        <div
            ref={nodeRef}
            className={`absolute z-20 w-full max-w-sm mx-2 sm:w-80 rounded-lg shadow-2xl bg-gray-900/80 backdrop-blur-md border border-cyan-500/50 flex flex-col transition-all duration-300 ${isDragging ? 'cursor-grabbing' : ''}`}
            style={{ top: position.y, left: position.x, height: isMinimized ? 'auto' : '60vh', maxHeight: isMinimized ? 'auto' : '20rem' }}
        >
            <header
                onMouseDown={handleMouseDown}
                onTouchStart={handleTouchStart}
                className={`flex items-center justify-between p-2 border-b border-cyan-500/30 touch-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
            >
                <div className="flex items-center gap-2">
                    <ClipboardDocumentListIcon className="w-5 h-5 text-cyan-400" />
                    <h3 className="font-semibold text-sm text-gray-200">Scratchpad</h3>
                </div>
                <div className="flex items-center">
                    <button onClick={() => onAttach(content)} title="Attach to Bulletin" className="p-1 text-gray-400 hover:text-white">
                        <UploadIcon className="w-4 h-4" />
                    </button>
                    <button onClick={onToggleMinimize} className="p-1 text-gray-400 hover:text-white">
                        {isMinimized ? <AmplifyIcon className="w-4 h-4" /> : <MinusIcon className="w-4 h-4" />}
                    </button>
                    <button onClick={onClose} className="p-1 text-gray-400 hover:text-white">
                        <XMarkIcon className="w-4 h-4" />
                    </button>
                </div>
            </header>
            <div className={`flex-grow transition-all duration-300 overflow-hidden ${isMinimized ? 'h-0' : 'h-full'}`}>
                <textarea
                    value={content}
                    onChange={(e) => onContentChange(e.target.value)}
                    placeholder="Jot down notes, code snippets, or ideas..."
                    className="w-full h-full p-2 bg-transparent text-gray-300 resize-none focus:outline-none placeholder-gray-500 text-sm"
                />
            </div>
        </div>
    );
};

export default Scratchpad;