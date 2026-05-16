export const colors = {
  health: {
    running: 'bg-[#22c55e] shadow-[0_0_10px_#22c55e,inset_1px_1px_2px_rgba(255,255,255,0.8)] border border-[#16a34a]', // Green LED
    error: 'bg-[#ef4444] shadow-[0_0_10px_#ef4444,inset_1px_1px_2px_rgba(255,255,255,0.8)] border border-[#dc2626]',   // Red LED
    starting: 'bg-[#f59e0b] shadow-[0_0_10px_#f59e0b,inset_1px_1px_2px_rgba(255,255,255,0.8)] border border-[#d97706]', // Amber LED
    stopped: 'bg-[#94a3b8] shadow-[inset_1px_1px_3px_rgba(0,0,0,0.3)] border border-[#64748b]', // Off LED
    unknown: 'bg-[#94a3b8] shadow-[inset_1px_1px_3px_rgba(0,0,0,0.3)] border border-[#64748b]'
  },
  text: {
    running: 'text-[#166534]',
    error: 'text-[#991b1b]',
    starting: 'text-[#b45309]',
    stopped: 'text-[#475569]',
    unknown: 'text-[#475569]'
  },
  border: {
    running: 'border-[#22c55e]',
    error: 'border-[#ef4444]',
    starting: 'border-[#f59e0b]',
    stopped: 'border-[#cbd5e1]',
    unknown: 'border-[#cbd5e1]'
  },
  bgSubtle: {
    running: 'bg-[#22c55e]/20',
    error: 'bg-[#ef4444]/20',
    starting: 'bg-[#f59e0b]/20',
    stopped: 'bg-[#cbd5e1]',
    unknown: 'bg-[#cbd5e1]'
  }
};
