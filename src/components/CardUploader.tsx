import React, { useState, useRef } from 'react';
import { UploadCloud, Loader2, CheckCircle, AlertCircle, X } from 'lucide-react';

export function CardUploader() {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'warning' | 'error', message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const uploadFiles = async (files: FileList | File[]) => {
    // Convert to array and filter out non-images just in case
    const fileArray = Array.from(files).filter(f => f.type.startsWith('image/'));
    
    if (fileArray.length === 0) {
      setStatus({ type: 'error', message: "Please select image files only." });
      return;
    }

    setUploading(true);
    setStatus(null);
    let successCount = 0;
    let failedCount = 0;

    try {
      // Upload one by one to avoid 413 Payload Too Large errors
      for (const file of fileArray) {
        const formData = new FormData();
        formData.append('cards', file);

        try {
          const response = await fetch('/api/upload-cards', {
            method: 'POST',
            body: formData,
          });

          if (response.ok) {
            successCount++;
          } else {
            failedCount++;
          }
        } catch (err) {
          failedCount++;
          console.error("Error uploading file", file.name, err);
        }
      }

      if (failedCount > 0) {
        setStatus({ type: 'warning' as any, message: `${successCount} uploaded, ${failedCount} failed. Some files might be too large.` });
      } else {
        setStatus({ type: 'success', message: `${successCount} cards successfully uploaded and renamed!` });
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err: any) {
      setStatus({ type: 'error', message: err.message || "An unexpected error occurred during upload." });
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      uploadFiles(e.dataTransfer.files);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      uploadFiles(e.target.files);
    }
  };

  return (
    <div className="bg-[#0e0e14] border border-white/10 rounded-lg p-6 max-w-2xl w-full text-center mx-auto shadow-2xl relative overflow-hidden">
      
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#DEB564] via-yellow-300 to-amber-600 opacity-50"></div>
      
      <h2 className="text-2xl font-serif text-[#DEB564] mb-2">Upload Deck Images</h2>
      <p className="text-[#FFFAE3]/60 mb-6 text-sm">
        Select or drag-and-drop your Tarot Card images. They will be automatically renamed and stored in the <span className="font-mono text-amber-200/50">/public/cards</span> directory.
      </p>

      <div 
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !uploading && fileInputRef.current?.click()}
        className={`
          border-2 border-dashed rounded-lg p-10 flex flex-col items-center justify-center cursor-pointer transition-all duration-200 min-h-[250px]
          ${isDragging ? 'border-[#DEB564] bg-[#DEB564]/5' : 'border-white/20 hover:border-[#DEB564]/50 bg-white/[0.02]'}
          ${uploading ? 'opacity-50 pointer-events-none' : ''}
        `}
      >
        <input 
          type="file" 
          multiple 
          accept="image/*"
          ref={fileInputRef}
          className="hidden" 
          onChange={handleFileSelect}
        />
        
        {uploading ? (
          <div className="flex flex-col items-center">
            <Loader2 className="w-12 h-12 text-[#DEB564] animate-spin mb-4" />
            <p className="text-amber-200 font-medium tracking-wide">Uploading cards...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <div className="w-20 h-20 bg-white/5 rounded-full flex flex-col items-center justify-center mb-4">
               <UploadCloud className={`w-10 h-10 ${isDragging ? 'text-[#DEB564]' : 'text-[#FFFAE3]/40'}`} />
            </div>
            <p className="text-[#FFFAE3] mb-2">Drag and drop your images here</p>
            <p className="text-[#FFFAE3]/40 text-xs text-center max-w-sm">
              We process <b>.png, .jpg</b> formats. Card names like <b>"0 - the Fool.png"</b> will be renamed beautifully.
            </p>
            <button className="mt-4 px-6 py-2 bg-white/10 hover:bg-white/20 rounded-md transition-colors text-sm font-medium">
               Select Files
            </button>
          </div>
        )}
      </div>

      {status && (
        <div className={`mt-6 p-4 rounded-md flex items-start text-left gap-3 ${
          status.type === 'success' ? 'bg-green-900/20 text-green-400 border border-green-900/30' : 
          status.type === 'warning' ? 'bg-yellow-900/20 text-yellow-400 border border-yellow-900/30' :
          'bg-red-900/20 text-red-400 border border-red-900/30'
        }`}>
           {status.type === 'success' ? <CheckCircle className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
           <div className="flex-1">
             <p className="text-sm">{status.message}</p>
           </div>
           <button onClick={() => setStatus(null)} className="opacity-50 hover:opacity-100">
             <X className="w-4 h-4" />
           </button>
        </div>
      )}
    </div>
  );
}
