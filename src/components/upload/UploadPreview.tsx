import { Upload, X } from 'lucide-react';

interface UploadPreviewProps {
  preview: string;
  onRemove?: () => void;
}

export const UploadPreview = ({ preview, onRemove }: UploadPreviewProps) => (
  <>
    <img src={preview} alt="" className="w-full h-full object-cover" />
    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
      <div className="bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-xs text-pearl">
        <Upload size={14} /> Изменить
      </div>
      {onRemove && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="bg-red-500/60 backdrop-blur-md px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-xs text-white"
        >
          <X size={14} /> Удалить
        </button>
      )}
    </div>
  </>
);
