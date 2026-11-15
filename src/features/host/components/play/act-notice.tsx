import { Notice } from "@/components/ui/card";
import type { ActMessage } from "./use-act";

export function ActNotice({ message }: { message: ActMessage | null }) {
  return (
    <div aria-live="polite">
      {message ? (
        <Notice tone={message.tone}>
          {message.text}
          {message.issues && message.issues.length > 0 ? (
            <ul className="mt-1 list-disc ps-5" dir="ltr" lang="en">
              {message.issues.map((issue) => (
                <li key={issue} className="text-start">
                  {issue}
                </li>
              ))}
            </ul>
          ) : null}
        </Notice>
      ) : null}
    </div>
  );
}
