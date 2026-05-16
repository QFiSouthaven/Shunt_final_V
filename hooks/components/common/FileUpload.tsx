
import React, { useState, useRef, useCallback } from 'react';
import { UploadIcon, CheckIcon } from '../icons';
import Loader from '../Loader';

interface FileUploadProps {
  onFilesUploaded: (files: Array<{ filename: string; content: string; file: File }>) => void;
  acceptedFileTypes: string[];
  maxFileSizeMB: number;
  enableDirectoryUpload?: boolean;
}

const SKIPPED_EXTENSIONS = [
    // Archives not handled by JSZip
    '.tar', '.gz', '.rar', '.7z', '.tar.gz',
    // Fonts
    '.ttf', '.otf', '.woff', '.woff2', '.eot',
    // Common binary formats (excluding images which are handled separately)
    '.mp3', '.wav', '.ogg', '.flac',
    '.mp4', '.webm', '.mov', '.avi',
    '.exe', '.dll', '.so', '.dmg', '.app',
    '.docx', '.pptx', '.xlsx',
];

const FileUpload: React.FC<FileUploadProps> = ({ onFilesUploaded, acceptedFileTypes, maxFileSizeMB, enableDirectoryUpload = true }) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadSuccessMessage, setUploadSuccessMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const successTimeoutRef = useRef<number | null>(null);

  const formatBytes = (bytes: number, decimals = 2): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  const validateFile = useCallback((name: string, size: number, type: string): string | null | 'SKIP' => {
      const filenameOnly = name.split('/').pop() || name;
      const filenameLower = filenameOnly.toLowerCase();

      // Silently skip common binary/unsupported files and macOS metadata files
      if (SKIPPED_EXTENSIONS.some(ext => filenameLower.endsWith(ext)) || filenameLower === '.ds_store') {
          return 'SKIP';
      }

      const maxSizeInBytes = maxFileSizeMB * 1024 * 1024;
      if (size > maxSizeInBytes) {
          return `'${name}' (${formatBytes(size)}) is too large. The maximum file size is ${maxFileSizeMB}MB.`;
      }
      
      // Allow any image type if image/* is accepted, but specifically block SVG for AI API calls.
      if (acceptedFileTypes.includes('image/*') && type.startsWith('image/')) {
          if (type === 'image/svg+xml') {
              return `'${name}' has an unsupported SVG format. The AI API does not support vector images; please use a raster format like PNG, JPG, or WEBP.`;
          }
          return null;
      }
      
      let identifier: string;
      const parts = filenameOnly.split('.');
      if (parts.length === 1) { // e.g. Dockerfile
          identifier = filenameLower;
      } else if (parts[0] === '' && parts.length === 2) { // e.g. .gitignore
          identifier = `.${parts[1].toLowerCase()}`;
      } else { // e.g. script.js
          identifier = `.${parts[parts.length - 1].toLowerCase()}`;
      }

      if (!acceptedFileTypes.includes(identifier)) {
           return 'SKIP';
      }
      return null;
  }, [acceptedFileTypes, maxFileSizeMB]);


  const processSingleFile = useCallback(async (file: File, pathPrefix: string = ''): Promise<{ fileData: { filename: string; content: string; file: File } | null, warning: string | null }> => {
    const filename = pathPrefix + file.name;
    const validationResult = validateFile(filename, file.size, file.type);
    
    if (validationResult === 'SKIP') {
        return { fileData: null, warning: null }; // Silently skip
    }
    if (validationResult) {
        return { fileData: null, warning: validationResult };
    }

    const fileExtension = `.${file.name.split('.').pop()?.toLowerCase()}`;
    let content = '';
    let warning: string | null = null;

    if (file.type.startsWith('image/')) {
        // For images, we don't read the content as text. The consumer will handle the file object.
        content = `[Image File: ${filename}]`;
    } else if (fileExtension === '.pdf') {
        try {
            const pdfjsLib = await import('pdfjs-dist');
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://esm.sh/pdfjs-dist@4.4.168/build/pdf.worker.mjs';
            const buffer = await file.arrayBuffer();
            const typedarray = new Uint8Array(buffer);
            const pdf = await pdfjsLib.getDocument(typedarray).promise;
            let textContent = '';
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const text = await page.getTextContent();
                textContent += text.items.map(item => (item as any).str).join(' ');
                if (i < pdf.numPages) textContent += '\n\n--- Page Break ---\n\n';
            }
            content = textContent.trim();
        } catch (e) {
            warning = `Failed to parse PDF "${filename}". It may be corrupt or encrypted.`;
        }
    } else {
        try {
            content = await file.text();
        } catch (e) {
            warning = `Could not read "${filename}" as text. It might be a binary file.`;
        }
    }
    
    if (warning) return { fileData: null, warning };
    return { fileData: { filename, content, file }, warning: null };
  }, [validateFile]);


  const handleFileProcessing = useCallback(async (files: FileList | File[]) => {
    if (successTimeoutRef.current) clearTimeout(successTimeoutRef.current);
    setIsProcessing(true);
    setIsDragOver(false);
    setWarnings([]);
    setUploadSuccessMessage(null);

    const processedFiles: Array<{ filename: string; content: string; file: File }> = [];
    const currentWarnings: string[] = [];

    try {
        for (const file of Array.from(files)) {
          // FIX: Check for custom property if webkitRelativePath is empty (for dropped folders where we manually set path)
          const relativePath = (file as any).customRelativePath || (file as any).webkitRelativePath;
          const filename = relativePath || file.name;
          const fileExtension = `.${filename.split('.').pop()?.toLowerCase()}`;

          if (fileExtension === '.zip') {
            try {
              const JSZip = (await import('jszip')).default;
              const zip = await JSZip.loadAsync(file);
              for (const zipFilename in zip.files) {
                if (zip.files[zipFilename].dir) continue;
                
                const zipFile = zip.files[zipFilename];
                const newFile = new File([await zipFile.async('blob')], zipFile.name, { type: 'application/octet-stream' });
                const { fileData, warning } = await processSingleFile(
                    newFile,
                    `${file.name}/` // Prefix with zip file name
                );
                if(warning) currentWarnings.push(warning);
                if(fileData) processedFiles.push(fileData);
              }
            } catch (e) {
                currentWarnings.push(`Failed to process ZIP file "${filename}". It may be corrupt.`);
            }
          } else {
            const { fileData, warning } = await processSingleFile(file, relativePath ? '' : undefined);
            if(warning) currentWarnings.push(warning);
            if(fileData) processedFiles.push(fileData);
          }
        }

        if (processedFiles.length > 0) {
          onFilesUploaded(processedFiles);
          const message = `${processedFiles.length} file(s) processed successfully.`;
          setUploadSuccessMessage(message);
          successTimeoutRef.current = window.setTimeout(() => {
              setUploadSuccessMessage(null);
          }, 3000);
        }
    } catch(e) {
        console.error("Error during file processing:", e);
        currentWarnings.push("An unexpected error occurred during processing.");
    } finally {
        if (currentWarnings.length > 0) {
          setWarnings(currentWarnings);
        }
        setIsProcessing(false);
    }
  }, [onFilesUploaded, processSingleFile]);
  
  const readAllDirectoryEntries = async (directoryReader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> => {
    return new Promise((resolve, reject) => {
        let entries: FileSystemEntry[] = [];
        const readEntries = () => {
            directoryReader.readEntries(results => {
                if (results.length > 0) {
                    entries = entries.concat(Array.from(results));
                    readEntries();
                } else {
                    resolve(entries);
                }
            }, (err) => {
                console.error('Error reading directory entries:', err);
                reject(new Error('Failed to read directory entries. The directory might be corrupted or permissions may be denied.'));
            });
        };
        readEntries();
    });
  };

  const traverseFileTree = useCallback(async (entry: FileSystemEntry | null, path: string = ''): Promise<{ files: File[], warnings: string[] }> => {
      const collectedFiles: File[] = [];
      const collectedWarnings: string[] = [];
      if (!entry) return { files: [], warnings: [] };

      if (entry.isFile) {
          await new Promise<void>(resolve => {
              (entry as FileSystemFileEntry).file(file => {
                  const relativePath = path + file.name;
                  // FIX: Do not attempt to write to webkitRelativePath. It is read-only.
                  // We exclusively use the custom property for consistency.
                  (file as any).customRelativePath = relativePath;
                  
                  collectedFiles.push(file);
                  resolve();
              }, () => {
                  collectedWarnings.push(`Failed to read file: ${path}${entry.name}`);
                  resolve();
              });
          });
      } else if (entry.isDirectory) {
          const dirReader = (entry as FileSystemDirectoryEntry).createReader();
          const entries = await readAllDirectoryEntries(dirReader);
          for (const subEntry of entries) {
              const result = await traverseFileTree(subEntry, path + entry.name + '/');
              collectedFiles.push(...result.files);
              collectedWarnings.push(...result.warnings);
          }
      }
      return { files: collectedFiles, warnings: collectedWarnings };
  }, []);

  const onDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);

    try {
        if (e.dataTransfer.items && e.dataTransfer.items.length > 0 && (e.dataTransfer.items[0] as any).webkitGetAsEntry) {
            const items = Array.from(e.dataTransfer.items);
            const allFiles: File[] = [];
            let allWarnings: string[] = [];
    
            const treePromises = items.map(item => traverseFileTree((item as any).webkitGetAsEntry(), ''));
            const results = await Promise.all(treePromises);
            
            results.forEach(result => {
                allFiles.push(...result.files);
                allWarnings.push(...result.warnings);
            });
    
            if (allFiles.length > 0) {
                // Pass files directly to preserve custom properties attached in traverseFileTree
                await handleFileProcessing(allFiles);
            }
            if (allWarnings.length > 0) {
                setWarnings(prev => [...prev, ...allWarnings]);
            }
        } else if (e.dataTransfer.files) {
            await handleFileProcessing(e.dataTransfer.files);
        }
    } catch (err) {
        console.error("Error processing dropped directory:", err);
        setWarnings(prev => [...prev, "An error occurred while reading a directory. Some files may not have been processed."]);
    }
}, [handleFileProcessing, traverseFileTree]);

  const onFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFileProcessing(e.target.files);
    }
    e.target.value = '';
  };
  
  const stateClasses = isProcessing
    ? 'border-gray-500 bg-gray-700/50 cursor-wait'
    : uploadSuccessMessage
    ? 'border-green-500 bg-green-900/30'
    : isDragOver
    ? 'border-fuchsia-400 bg-fuchsia-900/30'
    : 'border-gray-600 hover:border-gray-500 hover:bg-gray-700/30';

  const acceptString = acceptedFileTypes
    .filter(type => type.startsWith('.') || type.includes('/')) // Only allow extensions and MIME types
    .join(',');

  const inputProps: any = {
      type: "file",
      ref: fileInputRef,
      onChange: onFileSelect,
      multiple: true,
      className: "hidden",
      accept: acceptString, // Use the sanitized string
  };
  if (enableDirectoryUpload) {
      inputProps.webkitdirectory = "";
  }

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={onDrop}
        className={`p-6 border-2 border-dashed rounded-lg text-center transition-all duration-300 ${stateClasses}`}
      >
        <input {...inputProps} />
        
        {isProcessing ? (
            <div className="flex flex-col items-center justify-center pointer-events-none">
                <Loader className="h-8 w-8" />
                <p className="mt-2 text-gray-400">Processing files...</p>
            </div>
        ) : uploadSuccessMessage ? (
            <div className="flex flex-col items-center justify-center pointer-events-none text-green-300">
                <CheckIcon className="w-8 h-8 mx-auto mb-2" />
                <p className="font-semibold">{uploadSuccessMessage}</p>
            </div>
        ) : (
            <div className="pointer-events-none">
                <UploadIcon className="w-8 h-8 mx-auto text-gray-400 mb-2" />
                <p className="text-gray-300">
                <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="font-semibold text-fuchsia-400 bg-transparent border-none p-0 underline hover:no-underline pointer-events-auto"
                >
                    Upload files{enableDirectoryUpload && ' or a folder'}
                </button>
                </p>
                <p className="text-sm text-gray-400">or drag and drop</p>
                <p className="text-xs text-gray-500 mt-1">
                Supported: {acceptedFileTypes.join(', ')} (Max {maxFileSizeMB})
                </p>
            </div>
        )}

      </div>
      {warnings.length > 0 && (
        <div className="mt-3 p-3 bg-yellow-900/50 border border-yellow-700 rounded-md text-sm">
          <p className="font-semibold text-yellow-300">Processing Warnings:</p>
          <ul className="list-disc list-inside mt-1 text-yellow-400">
            {warnings.map((warn, i) => <li key={i}>{warn}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
};

export default FileUpload;
    