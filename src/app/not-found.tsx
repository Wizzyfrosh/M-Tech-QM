import Link from "next/link";
export default function NotFound() {
  return (
    <main id="main" className="standalone">
      <span className="eyebrow">M TECH QMS · 404</span>
      <h1>This page isn’t here.</h1>
      <p>The link may be incomplete or no longer available.</p>
      <Link className="button primary" href="/dashboard">
        Back to your workspace
      </Link>
    </main>
  );
}
