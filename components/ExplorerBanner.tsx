"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { useState } from "react";

export function ExplorerBanner() {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div style={{
      position: "sticky",
      top: 0,
      zIndex: 100,
      background: "linear-gradient(135deg, #087f7a, #066662)",
      padding: "12px 24px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "12px"
    }}>
      <Sparkles size={18} color="white" />
      <span style={{ color: "white", fontSize: "14px", fontWeight: "600" }}>
        试试全新的探索体验？
      </span>
      <Link
        href="/explore"
        style={{
          background: "white",
          color: "#087f7a",
          padding: "8px 20px",
          borderRadius: "999px",
          fontSize: "13px",
          fontWeight: "700",
          textDecoration: "none",
          transition: "all 0.2s ease",
          transform: isHovered ? "scale(1.05)" : "scale(1)",
          boxShadow: isHovered ? "0 4px 12px rgba(0,0,0,0.2)" : "none"
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        立即探索 →
      </Link>
    </div>
  );
}
