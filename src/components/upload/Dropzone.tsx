import { Loader2, ImageIcon } from 'lucide-react';
import { LoadingInline } from '../../components/Loading';

interface DropzoneProps {
  uploading: boolean;
}

export const Dropzone = ({ uploading }: DropzoneProps) => (
  <div className="w-full h-full flex flex-col items-center justify-center bg-[#16161a]">
    {uploading ? (
      <Loader2 size={24} className="text-accent animate-spin mb-2" />
    ) : (
      <ImageIcon size={24} className="text-violet/20 mb-2" />
    )}
    <span className="text-[10px] text-pearl/60 uppercase tracking-widest font-bold">
      {uploading ? <LoadingInline /> : 'Нажмите, чтобы загрузить'}
    </span>
  </div>
);
