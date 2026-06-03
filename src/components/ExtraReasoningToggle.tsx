import { Sparkles } from "lucide-react";

interface Props {
  checked: boolean;
  onToggle: () => void;
}

/** The shared "Extra reasoning (deeper · slower)" switch. */
export function ExtraReasoningToggle({ checked, onToggle }: Props) {
  return (
    <label className="flex items-center justify-between gap-2 px-1 cursor-pointer select-none">
      <span className="flex items-center gap-1.5 text-[10px] text-[#FFFAE3]/60">
        <Sparkles className="w-3 h-3 text-[#DEB564]/60" />
        Extra reasoning <span className="opacity-40">(deeper · slower)</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={onToggle}
        className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${checked ? 'bg-[#DEB564]/70' : 'bg-white/15'}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-black transition-transform ${checked ? 'translate-x-4' : ''}`}></span>
      </button>
    </label>
  );
}
