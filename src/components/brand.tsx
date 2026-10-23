import Link from "next/link";
import { Layers3 } from "lucide-react";
export function Brand() {
  return (
    <Link href="/dashboard" className="brand" aria-label="M Tech QMS home">
      <span className="brand-mark">
        <Layers3 size={23} />
      </span>
      <span>
        M Tech <b>QMS</b>
        <small>LEARN. PRACTICE. PROGRESS.</small>
      </span>
    </Link>
  );
}
