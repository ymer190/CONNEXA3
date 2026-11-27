type AvatarProps = {
  initials: string;
  tone: string;
  size?: "small" | "medium" | "large";
  online?: boolean;
};

export function Avatar({ initials, tone, size = "medium", online }: AvatarProps) {
  return (
    <span className={"cx-avatar cx-avatar-" + size + " cx-tone-" + tone} aria-hidden="true">
      {initials}
      {online && <i className="cx-online-dot" />}
    </span>
  );
}
