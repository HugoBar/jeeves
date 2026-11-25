// A page that stands in for one that could not be shown: an error, or an
// address with nothing at it. `warning` tints the icon for an error.
export function PageNotice({
  icon,
  title,
  body,
  reference,
  warning = false,
  children,
}: {
  icon: string;
  title: string;
  body: string;
  reference?: string;
  warning?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="page-notice" role={warning ? "alert" : undefined}>
      <span className={warning ? "page-notice-icon page-notice-warning" : "page-notice-icon"}>
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d={icon} />
        </svg>
      </span>
      <h1>{title}</h1>
      <p>{body}</p>
      {reference ? <p className="page-notice-reference">{reference}</p> : null}
      <div className="page-notice-actions">{children}</div>
    </div>
  );
}

// Icon paths, 24x24.
export const noticeIcons = {
  // A triangle with an exclamation mark.
  error: "M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
  // A database cylinder.
  database: "M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3",
  // A magnifying glass.
  notFound: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-4.3-4.3",
} as const;

// The id Next.js gives a server error, which matches its line in the server
// log. The error's message is not shown: in production it has none.
export function errorDigest(error: unknown): string | undefined {
  return error instanceof Error && "digest" in error && typeof error.digest === "string" ? error.digest : undefined;
}
