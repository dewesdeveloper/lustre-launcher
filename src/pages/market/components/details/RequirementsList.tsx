import type { Requirement } from '../../types';

export const ReqRow = ({ label, value }: { label: string; value: string }) => (
  <div className="tl-srow">
    <span className="k tl-head text-[10px] font-bold uppercase tracking-[0.14em] shrink-0">{label}</span>
    <span className="v text-right max-w-[62%]">{value}</span>
  </div>
);

export const RequirementList = ({ req }: { req: Requirement }) => (
  <div className="text-xs">
    {req.os && <ReqRow label="OS" value={req.os} />}
    {req.processor && <ReqRow label="CPU" value={req.processor} />}
    {req.graphics_card && <ReqRow label="GPU" value={req.graphics_card} />}
    {req.ram && <ReqRow label="RAM" value={req.ram} />}
    {req.storage && <ReqRow label="Место на диске" value={req.storage} />}
  </div>
);

export default RequirementList;
