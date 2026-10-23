"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main id="main" className="standalone">
      <span className="eyebrow">M TECH QMS</span>
      <h1>We couldn’t open this page.</h1>
      <p>
        Please try again. If the problem continues, contact your instructor.
      </p>
      <button className="button primary" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
