"use client";

import { useEffect } from "react";

export default function PopupSuccessPage() {
  useEffect(() => {
    if (window.opener) {
      window.opener.postMessage({ type: "oauth_success" }, window.location.origin);
    }
    window.close();
  }, []);

  return null;
}
