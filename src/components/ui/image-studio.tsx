import * as Dialog from "@radix-ui/react-dialog";
import Cropper, { type Area } from "react-easy-crop";
import { useEffect, useRef, useState } from "react";
import { Camera, RotateCcw, RotateCw, SlidersHorizontal, X } from "lucide-react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { Skeleton } from "./skeleton";
import "react-easy-crop/react-easy-crop.css";
import "./image-studio.css";

gsap.registerPlugin(useGSAP);
type Adjustments = { brightness: number; contrast: number; saturation: number };
const original: Adjustments = { brightness: 100, contrast: 100, saturation: 100 };
const filterOf = (a: Adjustments) =>
  `brightness(${a.brightness}%) contrast(${a.contrast}%) saturate(${a.saturation}%)`;

/** Crop directly into a bounded canvas, avoiding full-resolution intermediate canvases. */
export function renderImageCrop(
  image: HTMLImageElement,
  area: Area,
  rotation: number,
  adjustments: Adjustments,
  maxWidth: number,
  maxHeight: number,
) {
  const radians = (rotation * Math.PI) / 180;
  const boxWidth =
    Math.abs(Math.cos(radians)) * image.naturalWidth +
    Math.abs(Math.sin(radians)) * image.naturalHeight;
  const boxHeight =
    Math.abs(Math.sin(radians)) * image.naturalWidth +
    Math.abs(Math.cos(radians)) * image.naturalHeight;
  const scale = Math.min(1, maxWidth / area.width, maxHeight / area.height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(area.width * scale));
  canvas.height = Math.max(1, Math.round(area.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas unavailable");
  context.imageSmoothingQuality = "high";
  context.scale(canvas.width / area.width, canvas.height / area.height);
  context.translate(-area.x, -area.y);
  context.translate(boxWidth / 2, boxHeight / 2);
  context.rotate(radians);
  context.translate(-image.naturalWidth / 2, -image.naturalHeight / 2);
  context.filter = filterOf(adjustments);
  context.drawImage(image, 0, 0);
  return canvas;
}

export function ImageStudio({
  file,
  kind,
  coverAspect,
  onClose,
  onSave,
}: {
  file: File;
  kind: "avatar" | "cover";
  coverAspect: number;
  onClose: () => void;
  onSave: (file: File) => Promise<boolean>;
}) {
  const panel = useRef<HTMLDivElement>(null),
    preview = useRef<HTMLCanvasElement>(null),
    zoomInput = useRef<HTMLInputElement>(null),
    alive = useRef(true),
    saving = useRef(false);
  const [source, setSource] = useState(""),
    [image, setImage] = useState<HTMLImageElement | null>(null),
    [error, setError] = useState("");
  const [crop, setCrop] = useState({ x: 0, y: 0 }),
    [zoom, setZoom] = useState(1),
    [rotation, setRotation] = useState(0),
    [area, setArea] = useState<Area | null>(null),
    [adjustments, setAdjustments] = useState(original),
    [aspect, setAspect] = useState(kind === "avatar" ? 1 : coverAspect),
    [busy, setBusy] = useState(false);
  const en = document.documentElement.lang === "en";
  const labels = {
    title: "Image Studio",
    subtitle: kind === "avatar" ? (en ? "Profile photo" : "ຮູບໂປຣໄຟລ໌") : en ? "Cover image" : "ຮູບປົກ",
    cancel: en ? "Cancel" : "ຍົກເລີກ",
    save: en ? "Save image" : "ບັນທຶກຮູບ",
    zoom: en ? "Zoom" : "ຊູມ",
    rotation: en ? "Rotation" : "ໝຸນຮູບ",
    brightness: en ? "Brightness" : "ຄວາມສະຫວ່າງ",
    contrast: en ? "Contrast" : "ຄວາມຄົມເຂັ້ມ",
    saturation: en ? "Color" : "ສີ",
    reset: en ? "Reset" : "ຄືນຄ່າເດີມ",
    preview: en ? "Preview" : "ຕົວຢ່າງ",
    close: en ? "Close" : "ປິດ",
    loading: en ? "Loading image…" : "ກຳລັງໂຫຼດຮູບ…",
    processing: en ? "Saving image…" : "ກຳລັງບັນທຶກຮູບ…",
    hint: en
      ? "Drag the image to frame it. Use the sliders to zoom and adjust color."
      : "ລາກຮູບເພື່ອຈັດຕຳແໜ່ງ ແລະ ໃຊ້ແຖບເລື່ອນເພື່ອຊູມ ຫຼື ປັບສີ.",
  };
  useEffect(() => {
    alive.current = true;
    const url = URL.createObjectURL(file),
      loaded = new Image();
    setSource(url);
    loaded.onload = () => {
      if (alive.current) setImage(loaded);
    };
    loaded.onerror = () => {
      if (alive.current)
        setError(
          en
            ? "This image could not be opened. Choose another image."
            : "ບໍ່ສາມາດເປີດຮູບນີ້ໄດ້. ກະລຸນາເລືອກຮູບອື່ນ.",
        );
    };
    loaded.src = url;
    return () => {
      alive.current = false;
      loaded.onload = null;
      loaded.onerror = null;
      URL.revokeObjectURL(url);
    };
  }, [file, en]);
  useGSAP(
    () => {
      const media = gsap.matchMedia();
      media.add(
        "(prefers-reduced-motion: no-preference)",
        () => {
          gsap.fromTo(
            panel.current,
            { autoAlpha: 0, y: 8 },
            { autoAlpha: 1, y: 0, duration: 0.18, ease: "power2.out" },
          );
        },
        panel,
      );
      return () => media.revert();
    },
    { scope: panel },
  );
  useEffect(() => {
    if (!image || !area) return;
    const frame = requestAnimationFrame(() => {
      const canvas = renderImageCrop(image, area, rotation, adjustments, 240, 150),
        target = preview.current;
      if (!target) return;
      target.width = canvas.width;
      target.height = canvas.height;
      target.getContext("2d")?.drawImage(canvas, 0, 0);
    });
    return () => cancelAnimationFrame(frame);
  }, [image, area, rotation, adjustments]);
  function reset() {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
    setAdjustments(original);
  }
  async function save() {
    if (!image || !area || saving.current) return;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      const canvas = renderImageCrop(
        image,
        area,
        rotation,
        adjustments,
        kind === "avatar" ? 512 : 2400,
        kind === "avatar" ? 512 : 1200,
      );
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (value) => (value ? resolve(value) : reject(new Error("Export failed"))),
          "image/webp",
          0.9,
        ),
      );
      if (!alive.current) return;
      const edited = new File([blob], file.name.replace(/\.[^.]*$/, "") + "-edited.webp", {
        type: blob.type,
      });
      if (await onSave(edited)) {
        if (alive.current) onClose();
      } else if (alive.current)
        setError(
          en
            ? "Could not save. Your edits are kept; try again."
            : "ບັນທຶກບໍ່ສຳເລັດ. ການປັບແຕ່ງຍັງຢູ່ ກະລຸນາລອງໃໝ່.",
        );
    } catch {
      if (alive.current)
        setError(
          en
            ? "Could not process this image. Try another image."
            : "ບໍ່ສາມາດປັບແຕ່ງຮູບນີ້ໄດ້. ກະລຸນາລອງຮູບອື່ນ.",
        );
    } finally {
      saving.current = false;
      if (alive.current) setBusy(false);
    }
  }
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="image-studio-overlay" />
        <Dialog.Content
          className="image-studio-shell"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            zoomInput.current?.focus();
          }}
          onEscapeKeyDown={(event) => {
            if (busy) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (busy) event.preventDefault();
          }}
        >
          <div className="image-studio-panel" ref={panel}>
            <header className="image-studio-header">
              <span className="image-studio-mark">
                <Camera size={21} aria-hidden="true" />
              </span>
              <div>
                <Dialog.Title>{labels.title}</Dialog.Title>
                <Dialog.Description>{labels.subtitle}</Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <button className="image-studio-icon" aria-label={labels.close} disabled={busy}>
                  <X size={20} aria-hidden="true" />
                </button>
              </Dialog.Close>
            </header>
            <div className="image-studio-body">
              <section className="image-studio-workspace" aria-label={labels.subtitle}>
                <div className="image-studio-crop-stage" aria-busy={busy}>
                  {source && (
                    <Cropper
                      image={source}
                      crop={crop}
                      zoom={zoom}
                      rotation={rotation}
                      aspect={aspect}
                      cropShape={kind === "avatar" ? "round" : "rect"}
                      onCropChange={setCrop}
                      onZoomChange={setZoom}
                      onRotationChange={setRotation}
                      onCropComplete={(_percent, pixels) => setArea(pixels)}
                      showGrid={kind === "cover"}
                      zoomWithScroll={false}
                      disableAutomaticStylesInjection
                      style={{ mediaStyle: { filter: filterOf(adjustments) } }}
                      cropperProps={{ tabIndex: busy ? -1 : 0, "aria-label": labels.hint }}
                      mediaProps={{
                        onError: () =>
                          setError(en ? "Could not read this image." : "ບໍ່ສາມາດອ່ານຮູບໄດ້."),
                      }}
                    />
                  )}
                  {!image && !error && <Skeleton variant="card" label={labels.loading} />}
                </div>
                <p className="image-studio-hint">{labels.hint}</p>
              </section>
              <aside
                className="image-studio-controls"
                aria-label={en ? "Image adjustments" : "ປັບແຕ່ງຮູບ"}
              >
                <div className="image-studio-control-heading">
                  <SlidersHorizontal size={17} aria-hidden="true" />
                  <strong>{en ? "Adjust image" : "ປັບແຕ່ງຮູບ"}</strong>
                  <button
                    className="image-studio-icon"
                    title={labels.reset}
                    aria-label={labels.reset}
                    disabled={busy}
                    onClick={reset}
                  >
                    <RotateCcw size={17} aria-hidden="true" />
                  </button>
                </div>
                <label>
                  {labels.zoom}
                  <output>{zoom.toFixed(1)}×</output>
                  <input
                    ref={zoomInput}
                    type="range"
                    min="1"
                    max="3"
                    step="0.01"
                    value={zoom}
                    disabled={busy}
                    onChange={(e) => setZoom(Number(e.target.value))}
                  />
                </label>
                <label>
                  {labels.rotation}
                  <output>{rotation}°</output>
                  <input
                    type="range"
                    min="-180"
                    max="180"
                    step="1"
                    value={rotation}
                    disabled={busy}
                    onChange={(e) => setRotation(Number(e.target.value))}
                  />
                </label>
                <button
                  className="image-studio-secondary"
                  disabled={busy}
                  onClick={() => setRotation((value) => ((value + 270) % 360) - 180)}
                >
                  <RotateCw size={16} aria-hidden="true" />
                  {en ? "Rotate 90°" : "ໝຸນ 90°"}
                </button>
                {kind === "cover" && (
                  <label>
                    {en ? "Crop shape" : "ສັດສ່ວນຮູບ"}
                    <select
                      value={aspect}
                      disabled={busy}
                      onChange={(e) => {
                        setAspect(Number(e.target.value));
                        setCrop({ x: 0, y: 0 });
                        setArea(null);
                      }}
                    >
                      <option value={coverAspect}>{en ? "Fit banner" : "ພໍດີຮູບປົກ"}</option>
                      <option value="3">3:1</option>
                      <option value={16 / 9}>16:9</option>
                    </select>
                  </label>
                )}
                {(["brightness", "contrast", "saturation"] as const).map((key) => (
                  <label key={key}>
                    {labels[key]}
                    <output>{adjustments[key]}%</output>
                    <input
                      type="range"
                      min={key === "saturation" ? 0 : 40}
                      max={key === "saturation" ? 200 : 160}
                      value={adjustments[key]}
                      disabled={busy}
                      onChange={(e) =>
                        setAdjustments((value) => ({ ...value, [key]: Number(e.target.value) }))
                      }
                    />
                  </label>
                ))}
                <div className="image-studio-presets">
                  {[
                    { name: en ? "Original" : "ເດີມ", value: original },
                    {
                      name: en ? "Vivid" : "ສີສົດ",
                      value: { brightness: 105, contrast: 110, saturation: 125 },
                    },
                    {
                      name: en ? "B&W" : "ຂາວດຳ",
                      value: { brightness: 100, contrast: 110, saturation: 0 },
                    },
                  ].map((preset) => (
                    <button
                      key={preset.name}
                      disabled={busy}
                      onClick={() => setAdjustments(preset.value)}
                    >
                      {preset.name}
                    </button>
                  ))}
                </div>
                <div className="image-studio-preview">
                  <span>{labels.preview}</span>
                  <canvas
                    ref={preview}
                    className={kind === "avatar" ? "image-studio-preview-avatar" : ""}
                    aria-label={labels.preview}
                  />
                </div>
              </aside>
            </div>
            {error && (
              <p className="image-studio-error" role="alert">
                {error}
              </p>
            )}
            <footer className="image-studio-footer">
              <button className="image-studio-secondary" disabled={busy} onClick={onClose}>
                {labels.cancel}
              </button>
              <button
                className="image-studio-save"
                disabled={busy || !image || !area}
                onClick={() => void save()}
              >
                {labels.save}
                {busy && <Skeleton variant="inline" label={labels.processing} />}
              </button>
            </footer>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
