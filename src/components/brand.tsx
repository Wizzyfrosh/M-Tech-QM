import Image from "next/image";
import Link from "next/link";
export function Brand() {
  return (
    <Link href="/dashboard" className="brand" aria-label="M Tech QMS home">
      <Image
        className="brand-image"
        src="/m-tech-hub-logo.jpg"
        width={1242}
        height={472}
        alt="M Tech Hub — Where future developers are made"
        loading="eager"
        unoptimized
      />
      <small>QUIZ MANAGEMENT SYSTEM</small>
    </Link>
  );
}
