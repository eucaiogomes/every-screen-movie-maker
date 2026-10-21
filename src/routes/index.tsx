import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Captura de Telas — Grave todos os monitores" },
      { name: "description", content: "Grave cada monitor da sua máquina e baixe um vídeo por tela." },
      { property: "og:title", content: "Captura de Telas" },
      { property: "og:description", content: "Grave cada monitor e baixe um vídeo por tela." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

type Rec = { stream: MediaStream; recorder?: MediaRecorder; chunks: Blob[]; id: string };
type Out = { url: string; name: string };
type Phase = "idle" | "granting" | "ready" | "recording" | "done";

function pickMime() {
  const opts = ['video/mp4;codecs="avc1.42E01E"', "video/mp4", "video/webm;codecs=vp9", "video/webm"];
  return opts.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
}

async function detectScreens(): Promise<number> {
  const w = window as unknown as { getScreenDetails?: () => Promise<{ screens: unknown[] }> };
  if (w.getScreenDetails) {
    const d = await w.getScreenDetails();
    return d.screens.length;
  }
  const s = window.screen as Screen & { isExtended?: boolean };
  return s.isExtended ? 2 : 1;
}

function Index() {
  const recs = useRef<Rec[]>([]);
  const [total, setTotal] = useState(0);
  const [granted, setGranted] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [outputs, setOutputs] = useState<Out[]>([]);
  const [error, setError] = useState("");

  const reset = () => {
    recs.current.forEach((r) => r.stream.getTracks().forEach((t) => t.stop()));
    recs.current = [];
    setGranted(0);
  };

  const askOne = async () => {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { displaySurface: "monitor", frameRate: 30 } as MediaTrackConstraints,
      audio: false,
      // @ts-expect-error chrome-only hints
      monitorTypeSurfaces: "include",
      selfBrowserSurface: "include",
    });
    const track = stream.getVideoTracks()[0];
    const settings = track.getSettings() as MediaTrackSettings & { displaySurface?: string };
    if (settings.displaySurface && settings.displaySurface !== "monitor") {
      stream.getTracks().forEach((t) => t.stop());
      throw new Error("Escolha a tela inteira (monitor), não uma janela ou aba.");
    }
    const id = settings.deviceId || track.label;
    if (recs.current.some((r) => r.id === id)) {
      stream.getTracks().forEach((t) => t.stop());
      throw new Error("Essa tela já foi escolhida. Selecione outro monitor.");
    }
    recs.current.push({ stream, chunks: [], id });
    setGranted(recs.current.length);
  };

  const start = async () => {
    setError("");
    setOutputs([]);
    reset();
    let n = 1;
    try {
      n = await detectScreens();
    } catch {
      setError("Permita o acesso às informações dos monitores para continuar.");
      return;
    }
    setTotal(n);
    setPhase("granting");
    await grantRemaining(n);
  };

  const grantRemaining = async (n = total) => {
    setError("");
    while (recs.current.length < n) {
      try {
        await askOne();
      } catch (e) {
        setError(e instanceof Error && e.message.length > 0 && !e.name.includes("NotAllowed")
          ? e.message
          : "Permissão negada. Você precisa permitir todas as telas para continuar.");
        return;
      }
    }
    setPhase("ready");
  };

  const startRecording = () => {
    const mime = pickMime();
    recs.current.forEach((r) => {
      const rec = new MediaRecorder(r.stream, mime ? { mimeType: mime } : undefined);
      rec.ondataavailable = (e) => e.data.size && r.chunks.push(e.data);
      rec.start(1000);
      r.recorder = rec;
    });
    setPhase("recording");
  };

  const stopAll = async () => {
    const results = await Promise.all(
      recs.current.map(
        (r, i) =>
          new Promise<Out>((resolve) => {
            const rec = r.recorder!;
            rec.onstop = () => {
              const blob = new Blob(r.chunks, { type: rec.mimeType || "video/webm" });
              resolve({ url: URL.createObjectURL(blob), name: `tela-${i + 1}.mp4` });
            };
            rec.stop();
            r.stream.getTracks().forEach((t) => t.stop());
          }),
      ),
    );
    recs.current = [];
    setOutputs(results);
    setPhase("done");
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-background px-6 text-foreground">
      <h1 className="text-4xl font-bold tracking-tight">Captura de Telas</h1>

      {(phase === "idle" || phase === "done") && (
        <button
          onClick={start}
          className="rounded-full bg-primary px-10 py-5 text-xl font-semibold text-primary-foreground shadow-lg transition hover:scale-105"
        >
          Iniciar captura de tela
        </button>
      )}

      {(phase === "granting" || phase === "ready") && (
        <div className="flex flex-col items-center gap-4">
          <p className="text-lg">
            Detectamos <strong>{total}</strong> monitor(es). Permitidos: <strong>{granted} de {total}</strong>
          </p>
          <div className="flex gap-2">
            {Array.from({ length: total }).map((_, i) => (
              <span
                key={i}
                className={`h-3 w-10 rounded-full ${i < granted ? "bg-primary" : "bg-muted"}`}
              />
            ))}
          </div>
          {phase === "granting" && (
            <button
              onClick={() => grantRemaining()}
              className="rounded-full border border-border px-6 py-3 font-medium hover:bg-accent"
            >
              Permitir próxima tela ({granted + 1} de {total})
            </button>
          )}
          <button
            onClick={startRecording}
            disabled={phase !== "ready"}
            className="rounded-full bg-primary px-8 py-4 text-lg font-semibold text-primary-foreground transition disabled:cursor-not-allowed disabled:opacity-40"
          >
            Continuar
          </button>
        </div>
      )}

      {phase === "recording" && (
        <div className="flex flex-col items-center gap-4">
          <p className="flex items-center gap-2 text-lg">
            <span className="h-3 w-3 animate-pulse rounded-full bg-destructive" />
            Gravando {total} tela(s)
          </p>
          <button onClick={stopAll} className="rounded-full bg-destructive px-6 py-3 font-semibold text-destructive-foreground">
            Parar e gerar vídeos
          </button>
        </div>
      )}

      {error && <p className="max-w-md text-center text-destructive">{error}</p>}

      {outputs.length > 0 && (
        <div className="grid w-full max-w-5xl gap-6 sm:grid-cols-2">
          {outputs.map((o) => (
            <div key={o.url} className="rounded-xl border border-border p-4">
              <video src={o.url} controls className="w-full rounded-lg" />
              <a href={o.url} download={o.name} className="mt-3 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
                Baixar {o.name}
              </a>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
