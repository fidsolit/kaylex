import type { ReactNode } from "react";
import { X } from "lucide-react";

interface ModalShellProps {
  title: string;
  children: ReactNode;
  onClose: () => void;
  widthClassName?: string;
}

export function ModalShell({
  title,
  children,
  onClose,
  widthClassName = "max-w-md",
}: ModalShellProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4 backdrop-blur-sm">
      <div className={`w-full rounded-t-3xl sm:rounded-3xl bg-white p-6 sm:p-8 shadow-2xl max-h-[95vh] overflow-y-auto sm:${widthClassName}`}>
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-bold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 hover:bg-slate-100"
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
