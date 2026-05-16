import React from 'react';
import { useMailbox } from '@/styles/services/context/MailboxContext';
import { FeedbackIcon, MailboxIcon, RedoIcon, UndoIcon } from '../icons';
import { useUndoRedoContext } from '@/styles/services/context/UndoRedoContext';

interface HeaderActionsProps {
    onOpenFeedback: () => void;
    onOpenMailbox: () => void;
}

const HeaderActions: React.FC<HeaderActionsProps> = ({
    onOpenFeedback,
    onOpenMailbox,
}) => {
    const { unreadCount } = useMailbox();
    const { undo, redo, canUndo, canRedo } = useUndoRedoContext();

    return (
        <div className="flex items-center gap-2">
            <button
                onClick={undo}
                disabled={!canUndo}
                className="p-2 rounded-full hover:bg-gray-700/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Undo"
            >
                <UndoIcon className="w-6 h-6 text-gray-300" />
            </button>
            <button
                onClick={redo}
                disabled={!canRedo}
                className="p-2 rounded-full hover:bg-gray-700/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Redo"
            >
                <RedoIcon className="w-6 h-6 text-gray-300" />
            </button>
             <div className="w-px h-6 bg-gray-700/50 mx-2"></div>
            <button
                onClick={onOpenFeedback}
                className="p-2 rounded-full hover:bg-gray-700/50 transition-colors"
                aria-label="Provide Feedback"
            >
                <FeedbackIcon className="w-6 h-6 text-gray-300" />
            </button>
            <button
                onClick={onOpenMailbox}
                className="relative p-2 rounded-full hover:bg-gray-700/50 transition-colors"
                aria-label={`Open Mailbox (${unreadCount} unread)`}
            >
                <MailboxIcon className="w-6 h-6 text-gray-300" />
                {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-fuchsia-500 text-white text-xs font-bold rounded-full flex items-center justify-center border-2 border-gray-800">
                        {unreadCount}
                    </span>
                )}
            </button>
        </div>
    );
};

export default React.memo(HeaderActions);
