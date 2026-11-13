export default function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className="tl-sec-head">
      <span className="bar" />
      <h2>{title}</h2>
      <span className="count">{count}</span>
      <span className="line" />
    </div>
  );
}
