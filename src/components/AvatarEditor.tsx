import ImageCropper from './image-cropper/ImageCropper';

type Props = {
  src: string;
  title?: string;
  onConfirm: (blob: Blob) => void;
  onClose: () => void;
};

/** Квадратный кадр 512×512 в PNG (админка магазина ждёт именно PNG). */
export default function AvatarEditor({ src, title, onConfirm, onClose }: Props) {
  return <ImageCropper src={src} shape="avatar" title={title} format="image/png" onConfirm={onConfirm} onClose={onClose} />;
}
