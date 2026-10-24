import Image from "next/image";

export function LaunchScreen() {
  return <div id="qms-launch-screen" aria-hidden="true">
    <div className="launch-halo" />
    <div className="launch-brand">
      <Image src="/m-tech-hub-logo.jpg" width={1242} height={472} alt="" unoptimized priority />
      <span className="launch-divider" />
      <strong>M Tech QMS</strong>
      <p>LEARN. PRACTISE. PROGRESS.</p>
      <span className="launch-progress" />
    </div>
    <span className="launch-caption">Your community. Your progress.</span>
  </div>;
}
