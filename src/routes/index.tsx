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

type Rec = { stream: MediaStream; recorder: MediaRecorder; chunks: Blob[]; label: string };
type Out = { url: string; name: string };

function pickMime() {
  const opts = ['video/mp4;codecs="avc1.42E01E"', "video/mp4", "video/webm;codecs=vp9", "video/webm"];
  return opts.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
}

function Index() {
  const recs = useRef<Rec[]>([]);
  const [count, setCount] = useState(0);
  const [recording, setRecording] = useState(false);
  const [outputs, setOutputs] = useState<Out[]>([]);
  const [error, setError] = useState("");

  const addScreen = async () => {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: "monitor", frameRate: 30 } as MediaTrackConstraints,
        audio: false,
        // @ts-expect-error chrome-only hints
        monitorTypeSurfaces: "include",
        selfBrowserSurface: "include",
      });
      const mime = pickMime();
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const label = stream.getVideoTracks()[0]?.label || `Tela ${recs.current.length + 1}`;
      const rec: Rec = { stream, recorder, chunks: [], label };
      recorder.ondataavailable = (e) => e.data.size && rec.chunks.push(e.data);
      recorder.start(1000);
      recs.current.push(rec);
      setCount(recs.current.length);
      setRecording(true);
      setOutputs([]);
    } catch {
      setError("Permissão negada ou cancelada.");
    }
  };

  const stopAll = async () => {
    const results = await Promise.all(
      recs.current.map(
        (r, i) =>
          new Promise<Out>((resolve) => {
            r.recorder.onstop = () => {
              const type = r.recorder.mimeType || "video/webm";
              const blob = new Blob(r.chunks, { type });
              resolve({ url: URL.createObjectURL(blob), name: `tela-${i + 1}.mp4` });
            };
            r.recorder.stop();
            r.stream.getTracks().forEach((t) => t.stop());
          }),
      ),
    );
    recs.current = [];
    setCount(0);
    setRecording(false);
    setOutputs(results);
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-background px-6 text-foreground">
      <h1 className="text-4xl font-bold tracking-tight">Captura de Telas</h1>
      {!recording ? (
        <button
          onClick={addScreen}
          className="rounded-full bg-primary px-10 py-5 text-xl font-semibold text-primary-foreground shadow-lg transition hover:scale-105"
        >
          Iniciar captura de tela
        </button>
      ) : (
        <div className="flex flex-col items-center gap-4">
          <p className="flex items-center gap-2 text-lg">
            <span className="h-3 w-3 animate-pulse rounded-full bg-destructive" />
            Gravando {count} tela(s)
          </p>
          <div className="flex gap-3">
            <button onClick={addScreen} className="rounded-full border border-border px-6 py-3 font-medium hover:bg-accent">
              + Adicionar outro monitor
            </button>
            <button onClick={stopAll} className="rounded-full bg-destructive px-6 py-3 font-semibold text-destructive-foreground">
              Parar e gerar vídeos
            </button>
          </div>
          <p className="max-w-md text-center text-sm text-muted-foreground">
            O navegador só permite escolher um monitor por vez. Clique em "Adicionar outro monitor" para cada tela extra.
          </p>
        </div>
      )}
      {error && <p className="text-destructive">{error}</p>}
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
