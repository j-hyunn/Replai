"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  describeMediaError,
  isMediaCaptureAvailable,
  INSECURE_CONTEXT_MESSAGE,
} from "@/lib/utils/mediaError";

interface AudioDevice {
  deviceId: string;
  label: string;
}

const LEVEL_BARS = 30;

export default function AudioSettings() {
  const [micDevices, setMicDevices] = useState<AudioDevice[]>([]);
  const [speakerDevices, setSpeakerDevices] = useState<AudioDevice[]>([]);
  const [selectedMic, setSelectedMic] = useState("default");
  const [selectedSpeaker, setSelectedSpeaker] = useState("default");
  const [micVolume, setMicVolume] = useState([80]);
  const [speakerVolume, setSpeakerVolume] = useState([80]);
  const [isTesting, setIsTesting] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [permissionState, setPermissionState] = useState<"idle" | "denied" | "granted">("idle");
  // Why the request failed, not just that it did — "denied" is only one of the
  // reasons getUserMedia rejects.
  const [permissionError, setPermissionError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const loadDevices = useCallback(async () => {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const mics = devices
      .filter((d) => d.kind === "audioinput")
      .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `마이크 ${i + 1}` }));
    const speakers = devices
      .filter((d) => d.kind === "audiooutput")
      .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `스피커 ${i + 1}` }));
    setMicDevices(mics);
    setSpeakerDevices(speakers);
    if (mics[0]) setSelectedMic(mics[0].deviceId);
    if (speakers[0]) setSelectedSpeaker(speakers[0].deviceId);
  }, []);

  const applyPermissionState = useCallback(
    (state: PermissionState) => {
      if (state === "granted") {
        setPermissionState("granted");
        setPermissionError(null);
        loadDevices();
      } else if (state === "denied") {
        setPermissionState("denied");
      } else {
        // "prompt" → wait for the user to click the request button
        setPermissionState("idle");
        setPermissionError(null);
      }
    },
    [loadDevices],
  );

  useEffect(() => {
    let status: PermissionStatus | null = null;

    navigator.permissions
      ?.query({ name: "microphone" as PermissionName })
      .then((s) => {
        status = s;
        applyPermissionState(s.state);
        // Without this the panel stays stuck on "denied" after the user grants
        // the permission in browser settings, with no way back but a reload.
        s.onchange = () => applyPermissionState(s.state);
      })
      .catch(() => {
        // Permissions API not supported (Safari) — leave as idle so the request
        // button stays available.
      });

    return () => {
      if (status) status.onchange = null;
      stopTest();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyPermissionState]);

  async function requestPermission() {
    if (!isMediaCaptureAvailable()) {
      setPermissionState("denied");
      setPermissionError(INSECURE_CONTEXT_MESSAGE);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setPermissionState("granted");
      setPermissionError(null);
      await loadDevices();
    } catch (e) {
      setPermissionState("denied");
      setPermissionError(describeMediaError(e));
    }
  }

  const stopTest = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    setIsTesting(false);
    setMicLevel(0);
  }, []);

  async function startTest() {
    try {
      const constraints: MediaStreamConstraints = {
        audio: selectedMic !== "default" ? { deviceId: { exact: selectedMic } } : true,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const data = new Uint8Array(analyser.frequencyBinCount);
      setIsTesting(true);

      function tick() {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const val of data) sum += Math.abs(val - 128);
        const level = Math.min(100, (sum / data.length) * 4);
        setMicLevel(level);
        animFrameRef.current = requestAnimationFrame(tick);
      }
      tick();
    } catch (e) {
      setPermissionState("denied");
      setPermissionError(describeMediaError(e));
    }
  }

  function handleTestToggle() {
    if (isTesting) {
      stopTest();
    } else {
      startTest();
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Mic className="h-5 w-5" />
          음성
        </h2>
        <p className="text-base text-muted-foreground mt-1">
          면접 중 사용할 마이크와 스피커를 설정하세요.
        </p>
      </div>

      {permissionState === "idle" && (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3">
          <Mic className="h-4 w-4 text-muted-foreground shrink-0" />
          <p className="text-base text-muted-foreground flex-1">
            장치 목록을 불러오려면 마이크 권한이 필요해요.
          </p>
          <Button size="sm" onClick={requestPermission}>
            권한 허용
          </Button>
        </div>
      )}

      {permissionState === "denied" && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3">
          <Mic className="h-4 w-4 shrink-0 text-destructive" />
          <p className="flex-1 text-base text-destructive">
            {permissionError ?? "마이크 권한이 거부됐어요. 브라우저 설정에서 직접 허용해주세요."}
          </p>
          {/* Without a retry the panel is a dead end: every other control is
              pointer-events-none until permission is granted. */}
          <Button size="sm" variant="outline" onClick={requestPermission}>
            다시 시도
          </Button>
        </div>
      )}

      {/* Device selectors — only shown after permission granted */}
      <div className={`grid grid-cols-2 gap-6 ${permissionState !== "granted" ? "opacity-40 pointer-events-none" : ""}`}>
        <div className="space-y-2">
          <label className="text-base font-medium">마이크</label>
          <Select value={selectedMic} onValueChange={setSelectedMic}>
            <SelectTrigger>
              <SelectValue placeholder="마이크 선택" />
            </SelectTrigger>
            <SelectContent>
              {micDevices.map((d) => (
                <SelectItem key={d.deviceId} value={d.deviceId}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-base font-medium">스피커</label>
          <Select value={selectedSpeaker} onValueChange={setSelectedSpeaker}>
            <SelectTrigger>
              <SelectValue placeholder="스피커 선택" />
            </SelectTrigger>
            <SelectContent>
              {speakerDevices.map((d) => (
                <SelectItem key={d.deviceId} value={d.deviceId}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Volume sliders */}
      <div className={`grid grid-cols-2 gap-6 ${permissionState !== "granted" ? "opacity-40 pointer-events-none" : ""}`}>
        <div className="space-y-3">
          <label className="text-base font-medium">마이크 음량</label>
          <Slider
            value={micVolume}
            onValueChange={setMicVolume}
            min={0}
            max={100}
            step={1}
          />
        </div>

        <div className="space-y-3">
          <label className="text-base font-medium">스피커 음량</label>
          <Slider
            value={speakerVolume}
            onValueChange={setSpeakerVolume}
            min={0}
            max={100}
            step={1}
          />
        </div>
      </div>

      {/* Mic test */}
      <div className={`flex items-center gap-4 ${permissionState !== "granted" ? "opacity-40 pointer-events-none" : ""}`}>
        <Button
          onClick={handleTestToggle}
          variant={isTesting ? "destructive" : "default"}
          className="shrink-0"
        >
          {isTesting ? "테스트 중지" : "마이크 테스트"}
        </Button>

        {/* Level meter */}
        <div className="flex flex-1 items-center gap-[2px]">
          {Array.from({ length: LEVEL_BARS }).map((_, i) => {
            const threshold = (i / LEVEL_BARS) * 100;
            const active = micLevel > threshold;
            return (
              <div
                key={i}
                className={`h-5 flex-1 rounded-[2px] transition-colors duration-75 ${
                  active ? "bg-primary" : "bg-muted"
                }`}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
