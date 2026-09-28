import type { CSSProperties } from "react";

export default function DogLoader({ label, size = 72 }: { label?: string; size?: number }) {
  const style = { "--dog-size": `${size}px` } as CSSProperties;
  return (
    <div className="dog-loader" style={style} role="status" aria-label={label || "DOG loading"}>
      <div className="dog-loader-art" aria-hidden="true">
        <span className="dog-ear dog-ear-left" />
        <span className="dog-ear dog-ear-right" />
        <span className="dog-face">
          <span className="dog-eye dog-eye-left" />
          <span className="dog-eye dog-eye-right" />
          <span className="dog-muzzle"><span className="dog-nose" /><span className="dog-mouth" /></span>
        </span>
        <span className="dog-tail" />
      </div>
      {label && <span className="dog-loader-label">{label}</span>}
    </div>
  );
}
