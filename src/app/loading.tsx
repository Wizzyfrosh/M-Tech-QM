import { LoaderCircle } from "lucide-react";
export default function Loading() {
  return <main id="main" className="standalone" aria-busy="true"><section className="panel empty" role="status">
    <LoaderCircle size={28} className="spin"/><h2>Opening your workspace…</h2><p>Your next page is loading.</p>
  </section></main>;
}
