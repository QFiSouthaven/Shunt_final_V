// components/common/FeedbackModal.tsx
import React, { useState, useEffect } from 'react';
import { XMarkIcon, FeedbackIcon } from '../icons';

interface FeedbackModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const FeedbackModal: React.FC<FeedbackModalProps> = ({ isOpen, onClose }) => {
    const [feedbackType, setFeedbackType] = useState('General Feedback');
    const [message, setMessage] = useState('');
    const [isRendered, setIsRendered] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setIsRendered(true);
        } else {
            const timer = setTimeout(() => {
                setIsRendered(false);
                // Reset form state when modal is fully closed
                setMessage('');
                setFeedbackType('General Feedback');
            }, 300); // Match animation duration
            return () => clearTimeout(timer);
        }
    }, [isOpen]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!message.trim()) return;

        const subject = encodeURIComponent(`Aether Shunt Feedback: ${feedbackType}`);
        const body = encodeURIComponent(message);
        const mailtoLink = `mailto:halkive@gmail.com?subject=${subject}&body=${body}`;

        window.location.href = mailtoLink;
        
        // Close modal after trying to open mail client
        onClose();
    };
    
    if (!isRendered) return null;

    return (
        <div
            className={`fixed inset-0 z-50 flex items-center justify-center p-4 modal-backdrop ${isOpen ? 'bg-black/70' : 'bg-black/0'}`}
            aria-modal="true"
            role="dialog"
        >
            <div className={`modal-content ${isOpen ? 'open' : ''} bg-gray-800 border border-gray-700 rounded-lg shadow-xl w-full max-w-lg flex flex-col`}>
                <header className="flex items-center justify-between p-4 border-b border-gray-700 flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <FeedbackIcon className="w-6 h-6 text-fuchsia-400" />
                        <h2 className="text-lg font-semibold text-gray-200">Provide Feedback</h2>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </header>
                <main className="p-6 overflow-y-auto flex-grow">
                    <form onSubmit={handleSubmit}>
                        <p className="text-sm text-gray-400 mb-4">
                            This will open your default email client to send your feedback directly.
                        </p>
                        <div className="space-y-4">
                            <div>
                                <label htmlFor="feedbackType" className="block text-sm font-medium text-gray-300 mb-1">
                                    Feedback Type
                                </label>
                                <select
                                    id="feedbackType"
                                    value={feedbackType}
                                    onChange={(e) => setFeedbackType(e.target.value)}
                                    className="w-full p-2 bg-gray-900 border border-gray-600 rounded-md text-gray-200 focus:ring-fuchsia-500 focus:border-fuchsia-500"
                                >
                                    <option>General Feedback</option>
                                    <option>Bug Report</option>
                                    <option>Feature Request</option>
                                    <option>UI/UX Suggestion</option>
                                </select>
                            </div>
                            <div>
                                <label htmlFor="message" className="block text-sm font-medium text-gray-300 mb-1">
                                    Message
                                </label>
                                <textarea
                                    id="message"
                                    rows={6}
                                    value={message}
                                    onChange={(e) => setMessage(e.target.value)}
                                    required
                                    className="w-full p-2 bg-gray-900 border border-gray-600 rounded-md text-gray-200 focus:ring-fuchsia-500 focus:border-fuchsia-500"
                                    placeholder={`Please provide as much detail as possible.`}
                                />
                            </div>
                        </div>
                        <div className="mt-6 flex justify-end">
                            <button
                                type="submit"
                                disabled={!message.trim()}
                                className="px-6 py-2 bg-fuchsia-600 text-white font-semibold rounded-md hover:bg-fuchsia-500 disabled:bg-gray-700 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
                            >
                                Send via Email
                            </button>
                        </div>
                    </form>
                </main>
            </div>
        </div>
    );
};

export default FeedbackModal;