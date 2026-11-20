"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SectionHeading } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { GUEST_ONLY_BLOCKS, type Block, type BlockType } from "@/content/schema";
import type { Locale } from "@/i18n/config";
import { newBlock } from "@/templates/registry";
import { hostMessages } from "../messages";
import { BlockForm } from "./blocks";
import { Glyph, glyphs, IconButton, move } from "./editor-parts";

type Props = {
  blocks: Block[];
  onChange: (blocks: Block[]) => void;
  allowed: BlockType[];
  lang: Locale;
  timezone: string;
};

export function BlocksPanel({ blocks, onChange, allowed, lang, timezone }: Props) {
  const t = hostMessages(lang);
  const [open, setOpen] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [adding, setAdding] = useState<BlockType | "">("");
  // One section of each kind keeps the page tidy.
  const available = allowed.filter((type) => !blocks.some((b) => b.type === type));

  function add() {
    if (adding === "" || blocks.length >= 30) return;
    const block = newBlock(adding);
    onChange([...blocks, block]);
    setOpen(block.id);
    setAdding("");
  }

  return (
    <section aria-labelledby="blocks-heading">
      <SectionHeading id="blocks-heading" title={t.editor.blocksTitle} lead={t.editor.blocksLead} />
      <ol className="divide-y divide-line overflow-hidden rounded-panel border border-line bg-raised">
        {blocks.map((block, index) => {
          const name = t.editor.blocks[block.type];
          const expanded = open === block.id;
          const panelId = `block-panel-${block.id}`;
          const guestOnly = GUEST_ONLY_BLOCKS.has(block.type);
          return (
            <li key={block.id}>
              <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 sm:px-4 ${expanded ? "bg-surface/70" : ""}`}>
                <label className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    className="size-5 shrink-0 accent-fg"
                    checked={block.enabled}
                    onChange={(e) => onChange(blocks.map((b) => (b.id === block.id ? { ...b, enabled: e.target.checked } : b)))}
                  />
                  <span className="min-w-0">
                    <span className="sr-only">{t.editor.show}: </span>
                    <span className={`block font-semibold ${block.enabled ? "text-fg" : "text-muted"}`}>{name}</span>
                    <span className="block text-sm text-muted">
                      {block.enabled ? null : t.editor.hidden}
                      {block.enabled || !guestOnly ? null : " · "}
                      {guestOnly ? <span title={t.editor.guestOnlyHint}>{t.editor.guestOnly}</span> : null}
                    </span>
                  </span>
                </label>
                <div className="flex items-center gap-0.5">
                  <IconButton label={`${t.common.moveUp}: ${name}`} disabled={index === 0} onClick={() => onChange(move(blocks, index, -1))}>
                    <Glyph d={glyphs.up} />
                  </IconButton>
                  <IconButton
                    label={`${t.common.moveDown}: ${name}`}
                    disabled={index === blocks.length - 1}
                    onClick={() => onChange(move(blocks, index, 1))}
                  >
                    <Glyph d={glyphs.down} />
                  </IconButton>
                  <Button
                    variant={expanded ? "ghost" : "secondary"}
                    size="sm"
                    className="ms-1 min-w-24"
                    aria-expanded={expanded}
                    aria-controls={panelId}
                    onClick={() => setOpen(expanded ? null : block.id)}
                  >
                    {expanded ? t.editor.closeSection : t.editor.editSection}
                    <span className="sr-only">: {name}</span>
                  </Button>
                </div>
              </div>
              {expanded ? (
                <div id={panelId} className="flex flex-col gap-5 border-t border-line bg-surface/40 px-3 pb-4 pt-5 sm:px-4">
                  <BlockForm
                    block={block}
                    lang={lang}
                    timezone={timezone}
                    onChange={(next) => onChange(blocks.map((b) => (b.id === block.id ? next : b)))}
                  />
                  <div className="border-t border-line pt-4">
                    {removing === block.id ? (
                      <div role="alertdialog" aria-label={t.editor.removeConfirm} className="flex flex-wrap items-center gap-2">
                        <p className="w-full text-sm font-medium">{t.editor.removeConfirm}</p>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => {
                            onChange(blocks.filter((b) => b.id !== block.id));
                            setRemoving(null);
                            setOpen(null);
                          }}
                        >
                          {t.common.confirm}
                        </Button>
                        <Button variant="secondary" size="sm" onClick={() => setRemoving(null)}>
                          {t.common.keep}
                        </Button>
                      </div>
                    ) : (
                      <Button variant="danger" size="sm" onClick={() => setRemoving(block.id)}>
                        {t.editor.removeSection}
                      </Button>
                    )}
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>

      <div className="mt-4 flex flex-wrap items-end gap-2">
        {available.length > 0 ? (
          <>
            <div className="min-w-48 flex-1 sm:max-w-sm">
              <label htmlFor="add-block" className="mb-1.5 block text-sm font-medium">
                {t.editor.addBlock}
              </label>
              <Select id="add-block" value={adding} onChange={(e) => setAdding(e.target.value as BlockType | "")}>
                <option value="">{t.editor.addBlockPlaceholder}</option>
                {available.map((type) => (
                  <option key={type} value={type}>
                    {t.editor.blocks[type]}
                  </option>
                ))}
              </Select>
            </div>
            <Button variant="secondary" disabled={adding === ""} onClick={add}>
              {t.common.add}
            </Button>
          </>
        ) : (
          <p className="text-sm text-muted">{t.editor.noMoreBlocks}</p>
        )}
      </div>
    </section>
  );
}
