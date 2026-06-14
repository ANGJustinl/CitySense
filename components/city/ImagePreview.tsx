"use client";

import { useEffect, useState } from "react";
import { ExternalLink, X } from "lucide-react";

type PreviewableImageProps = {
  src: string;
  alt: string;
  className?: string;
  wrapperClassName?: string;
  loading?: "eager" | "lazy";
};

export function PreviewableImage({
  src,
  alt,
  className,
  wrapperClassName,
  loading = "lazy"
}: PreviewableImageProps) {
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (hidden) {
    return null;
  }

  return (
    <>
      <button
        aria-label={`查看图片：${alt}`}
        className={wrapperClassName ? `image-preview-trigger ${wrapperClassName}` : "image-preview-trigger"}
        onClick={() => setOpen(true)}
        type="button"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- 外部来源图片直链需要 no-referrer，且 URL 可能过期 */}
        <img
          alt={alt}
          className={className}
          loading={loading}
          onError={() => setHidden(true)}
          referrerPolicy="no-referrer"
          src={src}
        />
      </button>

      {open ? (
        <div
          aria-modal="true"
          className="image-preview-backdrop"
          onClick={() => setOpen(false)}
          role="dialog"
        >
          <div className="image-preview-dialog" onClick={(event) => event.stopPropagation()}>
            <div className="image-preview-top">
              <strong>{alt}</strong>
              <div>
                <a href={src} rel="noreferrer" target="_blank" title="打开原图">
                  <ExternalLink size={16} />
                </a>
                <button aria-label="关闭图片预览" onClick={() => setOpen(false)} type="button">
                  <X size={18} />
                </button>
              </div>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element -- 外部来源图片直链需要 no-referrer，且 URL 可能过期 */}
            <img alt={alt} referrerPolicy="no-referrer" src={src} />
          </div>
        </div>
      ) : null}
    </>
  );
}
