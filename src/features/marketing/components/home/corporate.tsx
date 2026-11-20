import type { CSSProperties } from "react";
import type { Locale } from "@/i18n/config";
import { ScrollScene } from "@/scenes/ScrollScene";
import { marketingMessages } from "../../messages";
import { sceneStill, type MarketingScene } from "../../scenes";
import { StillFrame } from "../still-frame";

// Scene III: the hall. The company copy sits over the dark seats for the whole
// walk; on the hold, what companies get appears on the stage screen, one line
// after another, as if put up for the room.
export function Corporate({ lang, scene }: { lang: Locale; scene: MarketingScene | null }) {
  const t = marketingMessages(lang).corporate;
  const screen = (
    <ul className="mk-screen" style={{ "--n": t.list.length } as CSSProperties}>
      {t.list.map((item, index) => (
        <li key={item} className="mk-screen__line" style={{ "--i": index } as CSSProperties}>
          {item}
        </li>
      ))}
    </ul>
  );
  const copy = (
    <div className="mk-hall">
      <h2 id="corporate-title" className="mk-hall__title">
        {t.title}
      </h2>
      <p className="mk-hall__lead">{t.lead}</p>
    </div>
  );

  if (!scene) {
    return (
      <StillFrame id="companies" still={sceneStill("corporate.stage")} alt={t.alt} overlay={screen} aria-labelledby="corporate-title">
        {copy}
      </StillFrame>
    );
  }
  return (
    <ScrollScene id="companies" className="mk-scene" source={scene.source} manifest={scene.manifest} alt={t.alt} scrollVh={200} holdVh={60} frameOverlay={screen}>
      {copy}
    </ScrollScene>
  );
}
