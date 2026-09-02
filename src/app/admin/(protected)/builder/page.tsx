"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SECTION_TYPES, composeEmail, type SectionType } from "@/lib/composeEmail";

type SectionState = {
  id: string | null;
  content: string;
  savedContent: string;
};

type SectionsState = Record<SectionType, SectionState>;
type FieldEl = HTMLTextAreaElement | HTMLInputElement;

function emptyState(): SectionsState {
  const state = {} as SectionsState;
  for (const { type } of SECTION_TYPES) {
    state[type] = { id: null, content: "", savedContent: "" };
  }
  return state;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// So "example.com" becomes a real link, not a broken relative one. Leaves
// full URLs, mailto:, tel:, anchors, and site-relative paths alone.
function normalizeUrl(raw: string): string {
  const url = raw.trim();
  if (/^(https?:|mailto:|tel:)/i.test(url) || url.startsWith("#") || url.startsWith("/")) {
    return url;
  }
  return `https://${url}`;
}

export default function BuilderPage() {
  const [sections, setSections] = useState<SectionsState>(emptyState);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<SectionType>>(new Set(["main_body"]));
  const [savingType, setSavingType] = useState<SectionType | null>(null);
  const [deletingType, setDeletingType] = useState<SectionType | null>(null);
  const [sectionErrors, setSectionErrors] = useState<Partial<Record<SectionType, string>>>({});

  const fieldRefs = useRef<Partial<Record<SectionType, FieldEl>>>({});
  const [linkFormType, setLinkFormType] = useState<SectionType | null>(null);
  const [linkText, setLinkText] = useState("");
  const [linkUrl, setLinkUrl] = useState("");

  const [imageFormType, setImageFormType] = useState<SectionType | null>(null);
  const [imageAlt, setImageAlt] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  const loadSections = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/builder/sections");
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to load sections.");
      const data = await res.json();
      const next = emptyState();
      for (const row of data.sections as {
        id: string;
        section_type: SectionType;
        content: string | null;
      }[]) {
        next[row.section_type] = {
          id: row.id,
          content: row.content ?? "",
          savedContent: row.content ?? "",
        };
      }
      setSections(next);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load sections.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Fetch once on mount.
    loadSections();
  }, [loadSections]);

  const preview = useMemo(() => {
    const contentMap: Partial<Record<SectionType, string>> = {};
    for (const { type } of SECTION_TYPES) {
      contentMap[type] = sections[type].content;
    }
    return composeEmail(contentMap);
  }, [sections]);

  const previewDoc = useMemo(() => {
    const body = preview.html || '<p style="color:#9ca3af">Nothing to preview yet.</p>';
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{font-family:system-ui,sans-serif;padding:16px;margin:0;color:#111827;line-height:1.5;}</style></head><body>${body}</body></html>`;
  }, [preview.html]);

  function toggleExpanded(type: SectionType) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  function updateContent(type: SectionType, content: string) {
    setSections((prev) => ({ ...prev, [type]: { ...prev[type], content } }));
  }

  // Drops `html` in at the textarea's cursor (or the end if it isn't
  // focused) and leaves the cursor right after it. Shared by Insert Link
  // and Insert Image.
  function insertAtCursor(type: SectionType, html: string) {
    const el = fieldRefs.current[type];
    const current = sections[type].content;
    const start = el && typeof el.selectionStart === "number" ? el.selectionStart : current.length;
    const end = el && typeof el.selectionEnd === "number" ? el.selectionEnd : current.length;
    const next = current.slice(0, start) + html + current.slice(end);
    const cursorAfter = start + html.length;

    updateContent(type, next);

    requestAnimationFrame(() => {
      const target = fieldRefs.current[type];
      target?.focus();
      target?.setSelectionRange(cursorAfter, cursorAfter);
    });
  }

  function openLinkForm(type: SectionType) {
    setImageFormType(null);
    setLinkFormType(type);
    setLinkText("");
    setLinkUrl("");
  }

  function closeLinkForm() {
    setLinkFormType(null);
    setLinkText("");
    setLinkUrl("");
  }

  function handleInsertLink(type: SectionType) {
    if (!linkUrl.trim()) return;
    const url = normalizeUrl(linkUrl);
    const text = linkText.trim() || url;
    const linkHtml = `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(text)}</a>`;
    insertAtCursor(type, linkHtml);
    closeLinkForm();
  }

  function openImageForm(type: SectionType) {
    setLinkFormType(null);
    setImageFormType(type);
    setImageAlt("");
    setImageFile(null);
    setImageError(null);
  }

  function closeImageForm() {
    setImageFormType(null);
    setImageAlt("");
    setImageFile(null);
    setImageError(null);
  }

  async function handleInsertImage(type: SectionType) {
    if (!imageFile) return;
    setImageUploading(true);
    setImageError(null);
    try {
      const formData = new FormData();
      formData.append("file", imageFile);
      const res = await fetch("/api/builder/images", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed.");

      const alt = escapeHtml(imageAlt.trim());
      // display:block + margin so the image sits on its own line rather than
      // wedging inline with the surrounding text - the usual newsletter look.
      const imgHtml = `<img src="${escapeHtml(data.url)}" alt="${alt}" style="max-width:100%;height:auto;display:block;margin:12px 0;" />`;
      insertAtCursor(type, imgHtml);
      closeImageForm();
    } catch (err) {
      setImageError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setImageUploading(false);
    }
  }

  async function handleSave(type: SectionType) {
    setSavingType(type);
    setSectionErrors((prev) => ({ ...prev, [type]: undefined }));
    try {
      const res = await fetch("/api/builder/sections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section_type: type, content: sections[type].content }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save section.");
      setSections((prev) => ({
        ...prev,
        [type]: { id: data.id, content: data.content ?? "", savedContent: data.content ?? "" },
      }));
    } catch (err) {
      setSectionErrors((prev) => ({
        ...prev,
        [type]: err instanceof Error ? err.message : "Failed to save section.",
      }));
    } finally {
      setSavingType(null);
    }
  }

  async function handleDelete(type: SectionType) {
    const id = sections[type].id;
    if (!id) return;
    if (!confirm(`Delete the ${SECTION_TYPES.find((s) => s.type === type)?.label} section? This can't be undone.`))
      return;

    setDeletingType(type);
    setSectionErrors((prev) => ({ ...prev, [type]: undefined }));
    try {
      const res = await fetch(`/api/builder/sections/${id}`, { method: "DELETE" });
      if (!res.ok) {
        throw new Error((await res.json()).error ?? "Failed to delete section.");
      }
      setSections((prev) => ({ ...prev, [type]: { id: null, content: "", savedContent: "" } }));
    } catch (err) {
      setSectionErrors((prev) => ({
        ...prev,
        [type]: err instanceof Error ? err.message : "Failed to delete section.",
      }));
    } finally {
      setDeletingType(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Email Builder</h1>
        <p className="text-sm text-gray-500">
          Compose each section below. The preview on the right updates as you type.
        </p>
      </div>

      {loadError && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</p>
      )}

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        {/* Section editors */}
        <div className="flex-1 space-y-3">
          {loading ? (
            <p className="text-sm text-gray-500">Loading...</p>
          ) : (
            SECTION_TYPES.map(({ type, label, multiline }) => {
              const section = sections[type];
              const isExpanded = expanded.has(type);
              const hasChanges = section.content !== section.savedContent;
              const isEmpty = section.content.trim() === "";
              const canLink = type !== "subject";

              return (
                <div
                  key={type}
                  className="overflow-hidden rounded-lg border border-gray-200 bg-white"
                >
                  <button
                    type="button"
                    onClick={() => toggleExpanded(type)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                  >
                    <span className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">{label}</span>
                      {isEmpty ? (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                          Empty
                        </span>
                      ) : hasChanges ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                          Unsaved
                        </span>
                      ) : (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
                          Saved
                        </span>
                      )}
                    </span>
                    <span className="text-gray-400">{isExpanded ? "−" : "+"}</span>
                  </button>

                  {isExpanded && (
                    <div className="space-y-3 border-t border-gray-100 px-4 py-4">
                      {multiline ? (
                        <textarea
                          ref={(el) => {
                            fieldRefs.current[type] = el ?? undefined;
                          }}
                          value={section.content}
                          onChange={(e) => updateContent(type, e.target.value)}
                          rows={5}
                          placeholder={`${label} content (plain text or HTML)`}
                          className="w-full rounded-md border border-gray-300 px-3 py-2 text-base focus:border-gray-500 focus:outline-none"
                        />
                      ) : (
                        <input
                          ref={(el) => {
                            fieldRefs.current[type] = el ?? undefined;
                          }}
                          type="text"
                          value={section.content}
                          onChange={(e) => updateContent(type, e.target.value)}
                          placeholder={`${label} text`}
                          className="w-full rounded-md border border-gray-300 px-3 py-2 text-base focus:border-gray-500 focus:outline-none"
                        />
                      )}

                      {canLink && (
                        <div className="space-y-2">
                          <div className="flex gap-4">
                            <button
                              type="button"
                              onClick={() => openLinkForm(type)}
                              className="text-sm font-medium text-blue-600 hover:underline"
                            >
                              + Insert Link
                            </button>
                            <button
                              type="button"
                              onClick={() => openImageForm(type)}
                              className="text-sm font-medium text-blue-600 hover:underline"
                            >
                              + Insert Image
                            </button>
                          </div>

                          {linkFormType === type && (
                            <div className="flex flex-col gap-2 rounded-md border border-gray-200 bg-gray-50 p-3 sm:flex-row sm:items-end">
                              <div className="flex-1">
                                <label className="text-xs text-gray-500">Link text</label>
                                <input
                                  type="text"
                                  value={linkText}
                                  onChange={(e) => setLinkText(e.target.value)}
                                  placeholder="e.g. Shop Now"
                                  className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-500 focus:outline-none"
                                />
                              </div>
                              <div className="flex-1">
                                <label className="text-xs text-gray-500">URL</label>
                                <input
                                  type="url"
                                  value={linkUrl}
                                  onChange={(e) => setLinkUrl(e.target.value)}
                                  placeholder="https://..."
                                  className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-500 focus:outline-none"
                                />
                              </div>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleInsertLink(type)}
                                  disabled={!linkUrl.trim()}
                                  className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                                >
                                  Insert
                                </button>
                                <button
                                  type="button"
                                  onClick={closeLinkForm}
                                  className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}

                          {imageFormType === type && (
                            <div className="flex flex-col gap-2 rounded-md border border-gray-200 bg-gray-50 p-3">
                              <div>
                                <label className="text-xs text-gray-500">
                                  Image file (PNG, JPEG, GIF, or WebP — max 5 MB)
                                </label>
                                <input
                                  type="file"
                                  accept="image/png,image/jpeg,image/gif,image/webp"
                                  onChange={(e) => {
                                    setImageFile(e.target.files?.[0] ?? null);
                                    setImageError(null);
                                  }}
                                  className="w-full text-sm"
                                />
                              </div>
                              <div>
                                <label className="text-xs text-gray-500">
                                  Description (optional — shown if the image can&apos;t load)
                                </label>
                                <input
                                  type="text"
                                  value={imageAlt}
                                  onChange={(e) => setImageAlt(e.target.value)}
                                  placeholder="e.g. Our new logo"
                                  className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-500 focus:outline-none"
                                />
                              </div>
                              {imageError && <p className="text-sm text-red-600">{imageError}</p>}
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleInsertImage(type)}
                                  disabled={!imageFile || imageUploading}
                                  className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                                >
                                  {imageUploading ? "Uploading..." : "Insert"}
                                </button>
                                <button
                                  type="button"
                                  onClick={closeImageForm}
                                  className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {sectionErrors[type] && (
                        <p className="text-sm text-red-600">{sectionErrors[type]}</p>
                      )}
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleSave(type)}
                          disabled={savingType === type || deletingType === type || !hasChanges}
                          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                        >
                          {savingType === type ? "Saving..." : "Save Section"}
                        </button>
                        {section.id && (
                          <button
                            onClick={() => handleDelete(type)}
                            disabled={deletingType === type || savingType === type}
                            className="rounded-md border border-red-200 px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                          >
                            {deletingType === type ? "Deleting..." : "Delete Section"}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Live preview */}
        <div className="lg:sticky lg:top-4 lg:w-[420px] lg:flex-shrink-0">
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-100 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Preview</p>
              <p className="mt-1 truncate text-sm font-medium text-gray-900">
                {preview.subject || <span className="text-gray-400">(no subject)</span>}
              </p>
            </div>
            <iframe
              // No scripts, no same-origin access, no top-navigation - the
              // admin's pasted content can't do anything to this app. But an
              // empty sandbox also blocks target="_blank" links entirely
              // (they count as "popups"), so allow-popups is required for
              // the Insert Link feature to actually work. allow-popups-to-
              // escape-sandbox ensures the opened link is a normal, fully
              // functional tab (e.g. a real donation form), not itself
              // sandboxed.
              sandbox="allow-popups allow-popups-to-escape-sandbox"
              srcDoc={previewDoc}
              title="Email preview"
              className="h-[500px] w-full border-0"
            />
          </div>
          <p className="mt-2 text-xs text-gray-400">
            Every send also gets a &ldquo;Hi [name],&rdquo; greeting at the top. The
            unsubscribe line in the footer is added automatically &mdash; each
            subscriber gets their own link.
          </p>
        </div>
      </div>
    </div>
  );
}
