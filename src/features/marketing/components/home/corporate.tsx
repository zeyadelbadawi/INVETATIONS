import type { CSSProperties } from "react";
import type { Locale } from "@/i18n/config";
import { ScrollScene } from "@/scenes/ScrollScene";
import { marketingMessages } from "../../messages";
import { sceneStill, type MarketingScene } from "../../scenes";
import { StillFrame } from "../still-frame";

// Scene III: the hall. The company copy sits over the dark seats for the whole
// walk; as soon as the hold starts, what companies get is set under the
// headline, one line after another, well clear of the header.
export function Corporate({ lang, scene }: { lang: Locale; scene: MarketingScene | null }) {
  const t = marketingMessages(lang).corporate;
  const copy = (
    <div className="mk-hall">
      <h2 id="corporate-title" className="mk-hall__title">
        {t.title}
      </h2>
      <p className="mk-hall__lead">{t.lead}</p>
      <ul className="mk-hall__list" style={{ "--n": t.list.length } as CSSProperties}>
        {t.list.map((item, index) => (
          <li key={item} className="mk-hall__item" style={{ "--i": index } as CSSProperties}>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );

  if (!scene) {
    return (
      <StillFrame id="companies" still={sceneStill("corporate.stage")} alt={t.alt} aria-labelledby="corporate-title">
        {copy}
      </StillFrame>
    );
  }
  return (
    <ScrollScene id="companies" className="mk-scene" source={scene.source} manifest={scene.manifest} alt={t.alt} scrollVh={160} holdVh={50}>
      {copy}
    </ScrollScene>
  );
}
