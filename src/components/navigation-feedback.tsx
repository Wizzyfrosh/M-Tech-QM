"use client";
import { useLinkStatus } from "next/link";
import { LoaderCircle } from "lucide-react";
export function NavigationFeedback() {
  const { pending } = useLinkStatus();
  return pending ? <span role="status" className="navigation-feedback"><LoaderCircle size={15} className="spin"/><span className="sr-only">Opening page</span></span> : null;
}
