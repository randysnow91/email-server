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

export default function BuilderPage() {
  const [sections, setSections] = useState<SectionsState>(emptyState);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<SectionType>>(new Set(["main_body"]));
  const [savingType, setSavingType] = useState<SectionType | null>(null);
  const [sectionErrors, setSectionErrors] = useState<Partial<Record<SectionType, string>>>({});

  const fieldRefs = useRef<Partial<Record<SectionType, FieldEl>>>({});
  const [linkFormType, setLinkFormType] = useState<SectionType | null>(null);
  const [linkText, setLinkText] = useState("");
  const [linkUrl, setLinkUrl] = useState("");

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

  function openLinkForm(type: SectionType) {
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
    const url = linkUrl.trim();
    if (!url) return;
    const text = linkText.trim() || url;
    const linkHtml = `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(text)}</a>`;

    const el = fieldRefs.current[type];
    const current = sections[type].content;
    const start = el && typeof el.selectionStart === "number" ? el.selectionStart : current.length;
    const end = el && typeof el.selectionEnd === "number" ? el.selectionEnd : current.length;
    const next = current.slice(0, start) + linkHtml + current.slice(end);
    const cursorAfter = start + linkHtml.length;

    updateContent(type, next);
    closeLinkForm();

    // Put the cursor right after the inserted link so typing continues
    // naturally, once React has re-rendered the field with the new value.
    requestAnimationFrame(() => {
      const target = fieldRefs.current[type];
      target?.focus();
      target?.setSelectionRange(cursorAfter, cursorAfter);
    });
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

    const res = await fetch(`/api/builder/sections/${id}`, { method: "DELETE" });
    if (res.ok) {
      setSections((prev) => ({ ...prev, [type]: { id: null, content: "", savedContent: "" } }));
    } else {
      const data = await res.json();
      alert(data.error ?? "Failed to delete section.");
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

                      {canLink &&
                        (linkFormType === type ? (
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
                        ) : (
                          <button
                            type="button"
                            onClick={() => openLinkForm(type)}
                            className="text-sm font-medium text-blue-600 hover:underline"
                          >
                            + Insert Link
                          </button>
                        ))}

                      {sectionErrors[type] && (
                        <p className="text-sm text-red-600">{sectionErrors[type]}</p>
                      )}
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleSave(type)}
                          disabled={savingType === type || !hasChanges}
                          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                        >
                          {savingType === type ? "Saving..." : "Save Section"}
                        </button>
                        {section.id && (
                          <button
                            onClick={() => handleDelete(type)}
                            className="rounded-md border border-red-200 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                          >
                            Delete Section
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
              sandbox=""
              srcDoc={previewDoc}
              title="Email preview"
              className="h-[500px] w-full border-0"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
