'use client';

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, FileJson, CheckCircle } from 'lucide-react';

export default function Dropzone() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDone, setIsDone] = useState(false);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    
    setIsProcessing(true);
    setIsDone(false);
    
    try {
      const file = acceptedFiles[0];
      const text = await file.text();
      const json = JSON.parse(text);

      const response = await fetch('/api/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(json)
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      // Download the returned JSON
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = response.headers.get('Content-Disposition')?.split('filename="')[1]?.replace('"', '') || 'roll20_character.json';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setIsDone(true);
      setTimeout(() => setIsDone(false), 3000);
    } catch (err) {
      console.error('Error processing file:', err);
      alert('Failed to process character JSON.');
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/json': ['.json']
    },
    maxFiles: 1
  });

  return (
    <div
      {...getRootProps()}
      className={`
        relative overflow-hidden
        w-full max-w-2xl p-12 mx-auto mt-8
        rounded-3xl border-2 border-dashed
        transition-all duration-300 ease-in-out
        flex flex-col items-center justify-center gap-6 cursor-pointer
        backdrop-blur-xl bg-white/5
        ${isDragActive ? 'border-indigo-500 bg-indigo-500/10 scale-105 shadow-[0_0_40px_rgba(99,102,241,0.2)]' : 'border-white/20 hover:border-white/40 hover:bg-white/10'}
        ${isProcessing ? 'animate-pulse' : ''}
      `}
    >
      <input {...getInputProps()} />
      
      <div className="p-4 rounded-full bg-white/10 shadow-inner">
        {isDone ? (
          <CheckCircle className="w-12 h-12 text-emerald-400" />
        ) : isDragActive ? (
          <UploadCloud className="w-12 h-12 text-indigo-400" />
        ) : (
          <FileJson className="w-12 h-12 text-gray-300" />
        )}
      </div>

      <div className="text-center space-y-2">
        <h3 className="text-2xl font-bold text-white tracking-tight">
          {isDone ? 'Conversion Complete!' : isDragActive ? 'Drop to convert' : 'Upload Character File'}
        </h3>
        <p className="text-gray-400 font-medium">
          {isDone 
            ? 'Your Roll20 file is downloading...'
            : isDragActive 
              ? 'Release your mouse to begin' 
              : 'Drag & drop your D&D Beyond JSON here, or click to browse'}
        </p>
      </div>

      {/* Decorative gradient orb */}
      <div className="absolute -z-10 w-64 h-64 bg-indigo-500/20 rounded-full blur-[80px] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
    </div>
  );
}
