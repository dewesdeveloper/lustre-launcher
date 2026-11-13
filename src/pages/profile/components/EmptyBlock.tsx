export default function EmptyBlock({ text }: { text: string }) {
  return (
    <div className="py-16 text-center tl-head text-[10px] uppercase tracking-[0.2em] text-[var(--muted-2)]">{text}</div>
  );
}
