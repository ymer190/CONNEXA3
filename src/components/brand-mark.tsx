type BrandMarkProps = {
  compact?: boolean;
};

export function BrandMark({ compact = false }: BrandMarkProps) {
  return (
    <span className="brand" aria-label="Connexa">
      <span className="brand__symbol" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      {!compact && <span className="brand__name">connexa</span>}
    </span>
  );
}
