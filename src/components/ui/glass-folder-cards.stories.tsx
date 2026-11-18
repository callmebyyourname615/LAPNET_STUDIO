"use client";

import GlassFolder from "./glass-folder-cards";

/** Standalone reference scene; the document workspace supplies its own records. */
export default function GlassFolderCardsDemo() {
  return <div className="flex min-h-screen flex-wrap items-center justify-center gap-12 bg-background px-6 py-16">
    <GlassFolder label="My Files" art="aurora" seed={3} width={300} />
    <GlassFolder label="Archives" art="none" action="more" labelPlacement="top-left" width={300}
      files={[{ name: "Lookbook 2024", meta: "38 images", art: "dusk" }, { name: "Invoices", meta: "12 PDFs" }, { name: "Shoot — Lisbon", meta: "RAW · 2.1 GB", art: "ember" }, { name: "Contract.pdf", meta: "PDF · 320 KB" }]} />
    <GlassFolder label="My Files" meta="Wed 19 Aug" tone="dark" art="ember" seed={11} action="none" labelPlacement="top-right" width={300}
      files={[{ name: "Stills", meta: "64 images", art: "verdant" }, { name: "Edit notes", meta: "TXT · 4 KB" }, { name: "Grade v3", meta: "DRX · 18 MB", art: "aurora" }]} />
  </div>;
}
