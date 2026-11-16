import type { Locale } from "@/i18n/config";

const messages = {
  ar: {
    notice:
      "فريقنا عنده صلاحية مؤقتة على المناسبة دي عشان يجهّزها لك، لحد {date}. مش بيشوفوا أرقام تليفونات ضيوفك، ومش بيقدروا يدفعوا أو يمسحوا أو يتحكموا في كشف المولود.",
  },
  en: {
    notice:
      "Our team has temporary access to this event to set it up for you, until {date}. They can't see your guests' phone numbers, pay, delete anything or control the reveal.",
  },
} as const;

export function staffAccessMessages(locale: Locale) {
  return messages[locale];
}
