"use client";

export function RoomPolicySwitch({ value, onChange }: { value: string, onChange: (v: string) => void }) {
  return (
    <div className="flex bg-slate-900 border border-slate-700 rounded p-1 w-full sm:w-auto">
      {['strict', 'warn', 'off'].map(pol => (
        <button
          key={pol}
          type="button"
          onClick={() => onChange(pol)}
          className={`flex-1 sm:flex-none px-4 py-1.5 text-xs font-bold uppercase rounded transition-all ${
            value === pol ? 
              pol === 'strict' ? 'bg-rose-500 text-white' :
              pol === 'warn' ? 'bg-amber-500 text-white' :
              'bg-slate-600 text-white'
            : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          {pol}
        </button>
      ))}
    </div>
  );
}
