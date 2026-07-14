import Dropzone from '@/components/Dropzone';

export default function Home() {
  return (
    <main className="min-h-screen bg-[#050505] flex flex-col items-center justify-center p-8 relative overflow-hidden font-sans">
      {/* Deep Magical Background effects */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1200px] h-[600px] opacity-40 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-r from-red-900 via-purple-950 to-amber-900 blur-[120px] rounded-full mix-blend-screen" />
      </div>

      <div className="relative z-10 w-full max-w-4xl mx-auto flex flex-col items-center text-center space-y-10">
        <div className="inline-block px-5 py-2 rounded-full border border-amber-500/20 bg-amber-500/10 backdrop-blur-md text-xs uppercase tracking-widest text-amber-200/90 font-bold mb-2 shadow-[0_0_20px_rgba(245,158,11,0.15)]">
          ✨ D&D Beyond to Roll20
        </div>
        
        <h1 className="text-7xl md:text-9xl font-black text-transparent bg-clip-text bg-gradient-to-br from-amber-100 via-amber-400 to-red-600 tracking-tighter drop-shadow-sm pb-2">
          Mimic
        </h1>
        
        <p className="text-xl md:text-2xl text-stone-400 max-w-2xl leading-relaxed font-light">
          Breathe life into your campaigns. Drop your D&D Beyond PDF export and instantly summon a Roll20-ready character sheet.
        </p>

        <Dropzone />

        <div className="pt-16 flex flex-wrap items-center justify-center gap-8 text-sm text-stone-500 font-medium tracking-wide">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.6)]" />
            Instant Summon
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.6)]" />
            Frictionless Magic
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-red-600 shadow-[0_0_12px_rgba(220,38,38,0.6)]" />
            100% Private
          </div>
        </div>
      </div>
    </main>
  );
}
