
// components/image_analysis/ImageAnalysis.tsx
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { analyzeImage } from '@/styles/services/aiService';
import FileUpload from '../common/FileUpload';
import Loader from '../Loader';
import { PhotoIcon, SparklesIcon, XMarkIcon, ViewfinderCircleIcon, AdjustmentsHorizontalIcon, DocumentArrowDownIcon } from '../icons';
import MarkdownRenderer from '../common/MarkdownRenderer';
import { audioService } from '@/styles/services/audioService';
import { parseApiError } from '@/utils/errorLogger';
import { storage } from '@/utils/storage';
import { useRealTimePrompt } from '@/hooks/useRealTimePrompt';
import { RealTimeFeedback } from '../common/RealTimeFeedback';

// --- Reusable Zoom/Pan Hook ---

const MIN_SCALE = 1;
const MAX_SCALE = 8;

interface Transform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

// FIX: Defined a minimal interface for TouchList that is compatible with both React's synthetic event TouchList and the native TouchList to resolve type incompatibility.
interface MinimalTouchList {
    length: number;
    [index: number]: { clientX: number; clientY: number };
}

const useZoomPan = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState<Transform>({
    scale: 1,
    offsetX: 0,
    offsetY: 0,
  });

  const getDistance = (touches: MinimalTouchList) => {
    return Math.sqrt(
      Math.pow(touches[0].clientX - touches[1].clientX, 2) +
        Math.pow(touches[0].clientY - touches[1].clientY, 2)
    );
  };

  const getMidpoint = (touches: MinimalTouchList) => {
      return {
          x: (touches[0].clientX + touches[1].clientX) / 2,
          y: (touches[0].clientY + touches[1].clientY) / 2,
      };
  };
  
  const isPanning = useRef(false);
  const lastPanPoint = useRef({ x: 0, y: 0 });
  const lastPinchDistance = useRef(0);

  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

  const applyTransform = useCallback(({ scale, offsetX, offsetY }: Transform) => {
      const container = containerRef.current;
      if (!container) return { scale, offsetX, offsetY };

      const { width, height } = container.getBoundingClientRect();
      const newScale = clamp(scale, MIN_SCALE, MAX_SCALE);
      
      const maxOffsetX = newScale > 1 ? (width * newScale - width) / (2 * newScale) : 0;
      const maxOffsetY = newScale > 1 ? (height * newScale - height) / (2 * newScale) : 0;
      
      const newOffsetX = clamp(offsetX, -maxOffsetX, maxOffsetX);
      const newOffsetY = clamp(offsetY, -maxOffsetY, maxOffsetY);

      return { scale: newScale, offsetX: newOffsetX, offsetY: newOffsetY };
  }, []);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    if (transform.scale <= 1) return;
    isPanning.current = true;
    lastPanPoint.current = { x: e.clientX, y: e.clientY };
  }, [transform.scale]);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1 && transform.scale > 1) {
      isPanning.current = true;
      lastPanPoint.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if (e.touches.length === 2) {
      isPanning.current = false;
      lastPinchDistance.current = getDistance(e.touches);
    }
  }, [transform.scale]);

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!isPanning.current) return;
    const dx = (e.clientX - lastPanPoint.current.x) / transform.scale;
    const dy = (e.clientY - lastPanPoint.current.y) / transform.scale;
    setTransform(prev => applyTransform({ ...prev, offsetX: prev.offsetX + dx, offsetY: prev.offsetY + dy }));
    lastPanPoint.current = { x: e.clientX, y: e.clientY };
  }, [transform.scale, applyTransform]);
  
  const onTouchMove = useCallback((e: TouchEvent) => {
    e.preventDefault();
    if (e.touches.length === 1 && isPanning.current) {
      const dx = (e.touches[0].clientX - lastPanPoint.current.x) / transform.scale;
      const dy = (e.touches[0].clientY - lastPanPoint.current.y) / transform.scale;
      setTransform(prev => applyTransform({ ...prev, offsetX: prev.offsetX + dx, offsetY: prev.offsetY + dy }));
      lastPanPoint.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if (e.touches.length === 2) {
      const container = containerRef.current;
      if (!container) return;

      const newDist = getDistance(e.touches);
      if (lastPinchDistance.current === 0) {
        lastPinchDistance.current = newDist;
        return;
      }

      const scaleFactor = newDist / lastPinchDistance.current;
      const newScale = transform.scale * scaleFactor;
      
      const midpoint = getMidpoint(e.touches);
      const rect = container.getBoundingClientRect();
      const targetX = (midpoint.x - rect.left - container.clientWidth / 2) / transform.scale - transform.offsetX;
      const targetY = (midpoint.y - rect.top - container.clientHeight / 2) / transform.scale - transform.offsetY;

      const newOffsetX = transform.offsetX - (targetX * (scaleFactor - 1));
      const newOffsetY = transform.offsetY - (targetY * (scaleFactor - 1));

      setTransform(applyTransform({ scale: newScale, offsetX: newOffsetX, offsetY: newOffsetY }));
      lastPinchDistance.current = newDist;
    }
  }, [transform, applyTransform]);

  const onMouseUp = useCallback(() => { isPanning.current = false; }, []);
  const onTouchEnd = useCallback(() => { isPanning.current = false; lastPinchDistance.current = 0; }, []);

  const onWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;
    
    const scaleFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = transform.scale * scaleFactor;
    
    const rect = container.getBoundingClientRect();
    const targetX = (e.clientX - rect.left - container.clientWidth / 2) / transform.scale - transform.offsetX;
    const targetY = (e.clientY - rect.top - container.clientHeight / 2) / transform.scale - transform.offsetY;
    
    const newOffsetX = transform.offsetX - (targetX * (scaleFactor - 1));
    const newOffsetY = transform.offsetY - (targetY * (scaleFactor - 1));
    
    setTransform(applyTransform({ scale: newScale, offsetX: newOffsetX, offsetY: newOffsetY }));
  }, [transform, applyTransform]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    container.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd);
    container.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      container.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      container.removeEventListener('wheel', onWheel);
    };
  }, [onMouseMove, onMouseUp, onTouchMove, onTouchEnd, onWheel]);

  const reset = useCallback(() => {
    setTransform({ scale: 1, offsetX: 0, offsetY: 0 });
  }, []);

  return { containerRef, transform, isZoomed: transform.scale > 1, panHandlers: { onMouseDown, onTouchStart }, reset };
};

// --- Helpers ---
const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            if (typeof reader.result === 'string') {
                // Remove metadata prefix (e.g., "data:image/png;base64,")
                resolve(reader.result.split(',')[1]);
            } else {
                reject(new Error('Failed to convert file to base64'));
            }
        };
        reader.onerror = error => reject(error);
    });
};


// --- Component Definition ---

const ImageAnalysis: React.FC = () => {
    const [prompt, setPrompt] = useState<string>(() => localStorage.getItem('imageAnalysis_prompt') || 'Describe this image in detail.');
    const [imageMeta, setImageMeta] = useState<{ name: string; type: string } | null>(() => {
        try {
            const saved = localStorage.getItem('imageAnalysis_imageMeta');
            return saved ? JSON.parse(saved) : null;
        } catch { return null; }
    });
    
    // State now holds the File object (or Blob), not the massive base64 string
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    const [result, setResult] = useState<string | null>(() => localStorage.getItem('imageAnalysis_result'));
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    const { containerRef, transform, isZoomed, panHandlers, reset: resetZoom } = useZoomPan();

    // RT Prompt Hook
    const { feedback, isLoading: isRTLoading, applyFeedback, discardFeedback } = useRealTimePrompt(prompt, setPrompt);


    // --- Persistence Logic (IndexedDB) ---
    
    // Load image from IndexedDB on mount
    useEffect(() => {
        const loadFromStorage = async () => {
            try {
                const file = await storage.get<File>('imageAnalysis_file');
                if (file) {
                    setImageFile(file);
                    setPreviewUrl(URL.createObjectURL(file));
                }
            } catch (err) {
                console.error("Failed to load image from storage:", err);
            }
        };
        loadFromStorage();
    }, []);

    // Save image to IndexedDB when it changes
    useEffect(() => {
        if (imageFile) {
            storage.set('imageAnalysis_file', imageFile).catch(err => {
                console.warn("Failed to save image to persistent storage:", err);
                setError("Storage Warning: Failed to save image for next session.");
            });
            // Create fresh object URL
            const url = URL.createObjectURL(imageFile);
            setPreviewUrl(url);
            
            // Cleanup function to revoke old URL
            return () => {
                URL.revokeObjectURL(url);
            };
        } else {
            storage.del('imageAnalysis_file');
            setPreviewUrl(null);
        }
    }, [imageFile]);

    useEffect(() => { localStorage.setItem('imageAnalysis_prompt', prompt); }, [prompt]);
    useEffect(() => { result ? localStorage.setItem('imageAnalysis_result', result) : localStorage.removeItem('imageAnalysis_result'); }, [result]);
    useEffect(() => { imageMeta ? localStorage.setItem('imageAnalysis_imageMeta', JSON.stringify(imageMeta)) : localStorage.removeItem('imageAnalysis_imageMeta'); }, [imageMeta]);


    const handleFileUploaded = (files: Array<{ filename: string; content: string; file: File }>) => {
        if (files.length > 0) {
            const file = files[0].file;
            if (file.type.startsWith('image/')) {
                setImageMeta({ name: file.name, type: file.type });
                setImageFile(file); // Just store the file object
                setError(null);
            } else {
                setError('Please upload a valid image file (e.g., PNG, JPG, WEBP).');
            }
        }
    };

    const handleDownloadImage = () => {
        if (imageFile && previewUrl) {
            const link = document.createElement('a');
            link.href = previewUrl;
            link.download = imageMeta?.name || 'downloaded_image';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    };

    const handleAnalysis = useCallback(async (promptOverride?: string) => {
        const textToProcess = promptOverride || prompt;
        if (!textToProcess.trim() || !imageFile || !imageMeta || isLoading) {
            setError('Please upload an image and provide a prompt.');
            return;
        }

        setIsLoading(true);
        setError(null);
        setResult(null);
        audioService.playSound('send');

        try {
            // Convert to Base64 strictly for the API call
            const base64String = await fileToBase64(imageFile);
            
            const { resultText } = await analyzeImage(textToProcess, {
                base64Data: base64String,
                mimeType: imageMeta.type,
            });
            setResult(resultText);
            audioService.playSound('receive');
        } catch (e) {
            const userFriendlyMessage = parseApiError(e);
            setError(userFriendlyMessage);
            audioService.playSound('error');
        } finally {
            setIsLoading(false);
        }
    }, [prompt, imageFile, imageMeta, isLoading]);

    const handleClear = () => {
        setPrompt('Describe this image in detail.');
        setImageMeta(null);
        setImageFile(null); // This triggers useEffect to clear storage and revoke URL
        setResult(null);
        setError(null);
        resetZoom();
    }

    return (
        <div className="flex flex-col h-full">
            <div className="flex-grow p-4 md:p-6 grid grid-cols-1 lg:grid-cols-2 gap-6 overflow-auto">
                {/* Left Panel: Input & Controls */}
                <div className="flex flex-col gap-6">
                    <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg shadow-lg p-4 flex flex-col min-h-[300px]">
                        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                            <PhotoIcon className="w-6 h-6" /> Image Input
                        </h3>
                        {previewUrl ? (
                            <div
                                ref={containerRef}
                                className="relative group flex-grow rounded-md overflow-hidden bg-black/30 touch-none flex items-center justify-center"
                            >
                                <img
                                    src={previewUrl}
                                    alt="Uploaded preview"
                                    className={`max-w-full max-h-full object-contain transition-transform duration-100 ease-out ${
                                        isZoomed ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in'
                                    }`}
                                    style={{
                                        transform: `scale(${transform.scale}) translate(${transform.offsetX}px, ${transform.offsetY}px)`,
                                        transformOrigin: 'center center',
                                    }}
                                    {...panHandlers}
                                />
                                <div className="absolute top-2 right-2 flex gap-2 z-10">
                                    <button 
                                        onClick={handleDownloadImage} 
                                        className="p-2 bg-black/50 rounded-full text-white hover:bg-black/80 transition-opacity"
                                        title="Download Image"
                                    >
                                        <DocumentArrowDownIcon className="w-5 h-5"/>
                                    </button>
                                    <button 
                                        onClick={handleClear} 
                                        className="p-2 bg-black/50 rounded-full text-white hover:bg-black/80 transition-opacity"
                                        title="Clear Image"
                                    >
                                        <XMarkIcon className="w-5 h-5"/>
                                    </button>
                                </div>
                                {isZoomed && (
                                     <button onClick={resetZoom} className="absolute bottom-2 right-2 p-2 bg-black/50 rounded-full text-white hover:bg-black/80 transition-opacity z-10" title="Reset View">
                                        <ViewfinderCircleIcon className="w-5 h-5"/>
                                    </button>
                                )}
                            </div>
                        ) : (
                            <FileUpload
                                onFilesUploaded={handleFileUploaded}
                                acceptedFileTypes={['image/*', '.png', '.jpg', '.jpeg', '.webp']}
                                maxFileSizeMB={5}
                                enableDirectoryUpload={false}
                            />
                        )}
                    </div>
                    <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg shadow-lg p-4 flex-grow flex flex-col">
                        <h3 className="text-lg font-semibold text-white mb-4">Prompt</h3>
                        <textarea
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder="Enter your request..."
                            className="w-full flex-grow bg-gray-900/50 rounded-md border border-gray-700 p-3 text-gray-300 placeholder-gray-500 resize-none focus:outline-none focus:ring-2 focus:ring-fuchsia-500"
                            disabled={isLoading}
                        />
                         <RealTimeFeedback 
                             isLoading={isRTLoading} 
                             feedback={feedback} 
                             onApply={applyFeedback} 
                             onDiscard={discardFeedback} 
                        />
                        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <button
                                onClick={() => handleAnalysis()}
                                disabled={isLoading || !imageFile || !prompt.trim()}
                                className="w-full px-4 py-3 bg-fuchsia-600 text-white font-semibold rounded-md hover:bg-fuchsia-500 disabled:bg-gray-700 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                            >
                                {isLoading ? <Loader /> : <SparklesIcon className="w-5 h-5" />}
                                {isLoading ? 'Analyzing...' : 'Analyze Image'}
                            </button>
                             {/* New Hypercorrection Button */}
                            <button
                                onClick={() => handleAnalysis(`Conduct a rigorous 'Hypercorrection' analysis of this image, specifically treating it as a technical diagram (e.g., Draw.io). 

1. **Identify Flaws:** Pinpoint ambiguities, misaligned connectors, inconsistent shapes, or unclear labels.
2. **Correct Intent:** Infer the intended logic to relieve all ambiguity.
3. **Reconstruct:** Generate a corrected, definitive **Mermaid.js** code block that accurately represents the fixed structure.`)}
                                disabled={isLoading || !imageFile}
                                className="w-full px-4 py-3 bg-cyan-600 text-white font-semibold rounded-md hover:bg-cyan-500 disabled:bg-gray-700 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                                title="Perform a critical technical analysis to identify flaws in diagrams and generate a corrected Mermaid representation."
                            >
                                {isLoading ? <Loader /> : <AdjustmentsHorizontalIcon className="w-5 h-5" />}
                                Hypercorrection
                            </button>
                        </div>
                    </div>
                </div>
                {/* Right Panel: Output */}
                <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg shadow-lg flex flex-col">
                    <h3 className="text-lg font-semibold text-white p-4 border-b border-gray-700/50">Analysis Result</h3>
                    <div className="p-4 flex-grow relative overflow-auto">
                        {isLoading && (
                            <div className="absolute inset-0 flex flex-col justify-center items-center bg-gray-800/80 backdrop-blur-sm z-10 rounded-b-lg">
                                <Loader />
                                <p className="mt-4 text-gray-400">AI is analyzing the image...</p>
                            </div>
                        )}
                        {error && (
                            <div className="flex flex-col items-center justify-center h-full text-center text-red-400">
                                <p className="font-semibold">Analysis Failed</p>
                                <p className="text-sm mt-1">{error}</p>
                            </div>
                        )}
                        {!isLoading && !error && !result && (
                            <div className="flex items-center justify-center h-full text-gray-500">
                                Analysis output will appear here.
                            </div>
                        )}
                        {result && (
                            <MarkdownRenderer content={result} />
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ImageAnalysis;
