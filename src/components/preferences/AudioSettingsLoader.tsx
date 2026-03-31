"use client";

import dynamic from "next/dynamic";

const AudioSettings = dynamic(() => import("@/components/preferences/AudioSettings"), { ssr: false });

export default function AudioSettingsLoader() {
  return <AudioSettings />;
}
