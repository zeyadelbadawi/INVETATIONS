"use client";

import type { Block } from "@/content/schema";
import type { Locale } from "@/i18n/config";
import { DetailsForm } from "./details";
import { LocationForm } from "./location";
import { ContactForm, DressCodeForm, PeopleForm } from "./people-contact";
import { ProgrammeForm } from "./programme";
import { CountdownForm, FamiliesForm, FaqForm, GalleryForm, NotesForm, QuoteForm, StoryForm } from "./text-blocks";

type Props = { block: Block; onChange: (block: Block) => void; lang: Locale; timezone: string };

// One form per block type in src/content/schema.ts. The switch is exhaustive:
// a new block type fails the build here until it has a form.
export function BlockForm({ block, onChange, lang, timezone }: Props) {
  const shared = { onChange, lang, timezone };
  switch (block.type) {
    case "details":
      return <DetailsForm block={block} {...shared} />;
    case "countdown":
      return <CountdownForm block={block} {...shared} />;
    case "programme":
      return <ProgrammeForm block={block} {...shared} />;
    case "location":
      return <LocationForm block={block} {...shared} />;
    case "story":
      return <StoryForm block={block} {...shared} />;
    case "families":
      return <FamiliesForm block={block} {...shared} />;
    case "gallery":
      return <GalleryForm block={block} {...shared} />;
    case "quote":
      return <QuoteForm block={block} {...shared} />;
    case "dress_code":
      return <DressCodeForm block={block} {...shared} />;
    case "notes":
      return <NotesForm block={block} {...shared} />;
    case "faq":
      return <FaqForm block={block} {...shared} />;
    case "people":
      return <PeopleForm block={block} {...shared} />;
    case "contact":
      return <ContactForm block={block} {...shared} />;
    default: {
      const never: never = block;
      return never;
    }
  }
}
