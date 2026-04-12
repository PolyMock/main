"use client";

export default function PlaceholderLink({
  children,
  className,
  "aria-label": ariaLabel,
}: {
  children: React.ReactNode;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <a href="#" className={className} aria-label={ariaLabel} onClick={(e) => e.preventDefault()}>
      {children}
    </a>
  );
}
