/** Re-mounts on every navigation, so each page gently rises into place like water settling. */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-rise">{children}</div>;
}
