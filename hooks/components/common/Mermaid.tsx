
// components/common/Mermaid.tsx
import React, { useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { DocumentArrowDownIcon } from '../icons';

declare const mermaid: any;

interface MermaidProps {
    chart: string;
}

const Mermaid: React.FC<MermaidProps> = ({ chart }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [id] = useState(() => `mermaid-svg-${uuidv4()}`);
    const [hasRendered, setHasRendered] = useState(false);

    useEffect(() => {
        if (typeof mermaid === 'undefined' || !containerRef.current || !chart) {
            return;
        }

        // Reset render state and imperatively set loading message
        setHasRendered(false);
        if (containerRef.current) {
            containerRef.current.innerHTML = '<div class="text-gray-400">Rendering diagram...</div>';
        }

        const renderChart = async () => {
            try {
                // Sanitize the chart string to remove potentially problematic HTML tags
                // that an AI might have inserted. This version avoids injecting newlines
                // which can break string literals in the Mermaid syntax. It replaces all
                // HTML-like tags with a space.
                const sanitizedChart = chart.replace(/<[^>]*>/g, ' ');

                // Ensure mermaid is initialized
                 mermaid.initialize({
                    startOnLoad: false,
                    theme: 'dark',
                    securityLevel: 'loose',
                    themeVariables: {
                        background: '#1f2937', // gray-800
                        primaryColor: '#374151', // gray-700
                        primaryTextColor: '#d1d5db', // gray-300
                        lineColor: '#6b7280', // gray-500
                        nodeBorder: '#a855f7', // purple-500
                    },
                });
                
                const { svg } = await mermaid.render(id, sanitizedChart);
                if (containerRef.current) {
                    containerRef.current.innerHTML = svg;
                    setHasRendered(true);
                }
            } catch (error) {
                let errorMessage = 'Unknown error';
                if (error instanceof Error) {
                    errorMessage = error.message;
                } else if (typeof error === 'string') {
                    errorMessage = error;
                } else if (typeof error === 'object' && error !== null && 'message' in error) {
                    errorMessage = String((error as {message: any}).message);
                } else {
                    try {
                        errorMessage = JSON.stringify(error, null, 2);
                    } catch {
                        errorMessage = 'Could not stringify the error object.';
                    }
                }
                console.error("Mermaid rendering error:", error);
                if (containerRef.current) {
                    containerRef.current.innerHTML = `<pre class="text-red-400">Mermaid rendering error:\n${errorMessage}</pre>`;
                }
            }
        };

        // Use a small timeout to allow the initial "rendering" message to appear before the potentially blocking mermaid call.
        setTimeout(renderChart, 10);

    }, [chart, id]);

    const handleDownload = () => {
        if (containerRef.current) {
            const svgContent = containerRef.current.innerHTML;
            const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `diagram-${id}.svg`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }
    };

    return (
        <div className="relative group inline-block min-w-full">
            <div
                ref={containerRef}
                className={`mermaid-container ${!hasRendered ? 'opacity-0' : 'opacity-100 transition-opacity'}`}
                style={{ lineHeight: 'initial' }} // Prevents prose styles from messing up the diagram
            />
            {hasRendered && (
                <button 
                    onClick={handleDownload} 
                    className="absolute top-2 right-2 p-1.5 bg-gray-800/80 text-gray-300 hover:text-white rounded-md border border-gray-600 opacity-0 group-hover:opacity-100 transition-opacity shadow-md backdrop-blur-sm"
                    title="Download Diagram as SVG"
                >
                    <DocumentArrowDownIcon className="w-5 h-5" />
                </button>
            )}
        </div>
    );
};

export default React.memo(Mermaid);
