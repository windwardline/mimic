import Dropzone from '@/components/Dropzone';

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-8 relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] opacity-30 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 blur-[100px] rounded-full mix-blend-screen" />
      </div>

      <div className="relative z-10 w-full max-w-4xl mx-auto flex flex-col items-center text-center space-y-8">
        <div className="inline-block px-4 py-1.5 rounded-full border border-white/10 bg-white/5 backdrop-blur-md text-sm text-gray-300 font-medium tracking-wide mb-4">
          ✨ D&D Beyond to Roll20 Converter
        </div>
        
        <h1 className="text-6xl md:text-8xl font-extrabold text-transparent bg-clip-text bg-gradient-to-br from-white via-white to-gray-500 tracking-tight">
          Meet Mimic.
        </h1>
        
        <p className="text-xl text-gray-400 max-w-2xl leading-relaxed">
          Instantly transform your character sheets. Drop your D&D Beyond JSON and watch it seamlessly convert into a Roll20-ready format in milliseconds.
        </p>

        <Dropzone />

        <div className="pt-12 flex items-center justify-center gap-8 text-sm text-gray-500 font-medium">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
            Instant Conversion
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]" />
            Secure Upload
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.5)]" />
            Roll20 Compatible
          </div>
        </div>
      </div>
    </main>
  );
}
