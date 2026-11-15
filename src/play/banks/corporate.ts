import { slots, t, type CorporateBank } from "./types";

export const corporateBank: CorporateBank = {
  polls: {
    title: t("رأيك يفرق", "Your say"),
    intro: t("صوّت، واليوم هيتظبط على اختياراتكم.", "Vote — the day will be shaped by what you choose."),
    items: [
      { id: "c-poll-opening", prompt: t("نبدأ اليوم بإيه؟", "How should we open the day?"), options: [t("كلمة الإدارة", "A word from leadership"), t("نشاط تعارف", "An icebreaker"), t("فطار خفيف", "A light breakfast"), t("ندخل في الموضوع على طول", "Straight to the agenda")] },
      { id: "c-poll-topic", prompt: t("أنهي موضوع تحب نركّز عليه؟", "Which topic should we spend most time on?"), options: slots(4, "الموضوع", "Topic") },
      { id: "c-poll-music", prompt: t("المزيكا في الحفلة تبقى إيه؟", "What music should we have?"), options: [t("هادية في الخلفية", "Quiet background music"), t("عربي", "Arabic hits"), t("أجنبي", "International hits"), t("فرقة لايف", "A live band")] },
      { id: "c-poll-food", prompt: t("الأكل يتقدّم إزاي؟", "How should food be served?"), options: [t("بوفيه مفتوح", "Open buffet"), t("أطباق على الترابيزة", "Plated at the table"), t("ركن لكل أكلة", "Food stations"), t("أكل خفيف واحنا واقفين", "Finger food")] },
      { id: "c-poll-entertainment", prompt: t("فقرة الترفيه تبقى إيه؟", "What should the entertainment be?"), options: [t("ستاند أب كوميدي", "Stand-up comedy"), t("فرقة موسيقية", "A band"), t("مسابقات بين الفرق", "Team contests"), t("عرض خفة يد", "A magic show")] },
      { id: "c-poll-time", prompt: t("أنسب ميعاد ليك؟", "What time suits you best?"), options: [t("الصبح", "Morning"), t("بعد الضهر", "Afternoon"), t("بالليل", "Evening")] },
      { id: "c-poll-dress", prompt: t("اللبس يبقى إيه؟", "What should the dress code be?"), options: [t("رسمي", "Formal"), t("سمارت كاجوال", "Smart casual"), t("كاجوال", "Casual"), t("لون موحّد", "One colour theme")] },
      { id: "c-poll-seating", prompt: t("تحب تقعد إزاي؟", "How would you like to be seated?"), options: [t("مع فريقي", "With my team"), t("ترابيزات مشكّلة نتعرف فيها", "Mixed tables to meet people"), t("أماكن حرة", "Free seating")] },
      { id: "c-poll-gift", prompt: t("هدية الحضور تبقى إيه؟", "Which giveaway would you like?"), options: [t("نوت بوك وقلم", "Notebook and pen"), t("مج", "A mug"), t("باور بانك", "A power bank"), t("شنطة", "A tote bag")] },
      { id: "c-poll-team-activity", prompt: t("نشاط الفرق يبقى إيه؟", "Which team activity?"), options: [t("مسابقة معلومات", "A trivia contest"), t("تحدي بناء", "A building challenge"), t("البحث عن الكنز", "A treasure hunt"), t("ورشة طبخ", "A cooking workshop")] },
      { id: "c-poll-talk-length", prompt: t("الكلمات تبقى قد إيه؟", "How long should the talks be?"), options: [t("١٠ دقايق وخلاص", "Ten minutes, no more"), t("٢٠ دقيقة", "Twenty minutes"), t("مش مهم طول ما هي ممتعة", "Any length, if it's good")] },
      { id: "c-poll-qa", prompt: t("تحب فقرة سؤال وجواب مع الإدارة؟", "Would you like a Q&A with leadership?"), options: [t("أيوه، أسئلة مباشرة", "Yes, live questions"), t("أيوه، أسئلة مكتوبة", "Yes, written questions"), t("مش ضروري", "Not needed")] },
    ],
  },

  predictions: {
    title: t("توقعات اليوم", "Predictions"),
    intro: t("توقّع قبل اليوم الكبير، والنتايج تتعلن على المسرح.", "Call it before the big day — results are announced on stage."),
    items: [
      { id: "c-pred-headcount", prompt: t("كام واحد هيحضر؟", "How many people will attend?"), answer: { type: "number", min: 0, max: 5000, unit: t("فرد", "people"), tolerance: 10 } },
      { id: "c-pred-product-name", prompt: t("المنتج الجديد اسمه إيه؟", "What is the new product called?"), answer: { type: "choice", options: slots(4, "الاسم", "Name") } },
      { id: "c-pred-team-award", prompt: t("مين هياخد جايزة فريق السنة؟", "Who will win Team of the Year?"), answer: { type: "choice", options: slots(4, "الفريق", "Team") } },
      { id: "c-pred-keynote-length", prompt: t("الكلمة الافتتاحية هتاخد كام دقيقة؟", "How many minutes will the opening speech run?"), answer: { type: "number", min: 1, max: 90, unit: t("دقيقة", "min"), tolerance: 3 } },
      { id: "c-pred-first-arrival", prompt: t("أول واحد هيوصل هيبقى من أنهي قسم؟", "Which department will arrive first?"), answer: { type: "choice", options: slots(4, "القسم", "Department") } },
      { id: "c-pred-end-time", prompt: t("هنخلّص الساعة كام؟", "What time will we wrap up?"), answer: { type: "time", format: "clock", tolerance: 15 } },
      { id: "c-pred-stage-word", prompt: t("أكتر كلمة هتتقال على المسرح؟", "Which word will be said most on stage?"), answer: { type: "choice", options: slots(4, "الكلمة", "Word") } },
      { id: "c-pred-award-count", prompt: t("كام جايزة هتتوزّع؟", "How many awards will be handed out?"), answer: { type: "number", min: 1, max: 100, unit: t("جايزة", "awards"), tolerance: 1 } },
      { id: "c-pred-target", prompt: t("حققنا كام في المية من هدف السنة؟", "What share of this year's target did we hit?"), answer: { type: "number", min: 0, max: 200, unit: t("٪", "%"), tolerance: 5 } },
      { id: "c-pred-contest-winner", prompt: t("أنهي فريق هيكسب مسابقة اليوم؟", "Which team will win today's contest?"), answer: { type: "choice", options: slots(4, "الفريق", "Team") } },
    ],
  },

  awards: {
    title: t("جوايز الجمهور", "People's choice awards"),
    intro: t("رشّح زمايلك اللي يستاهلوا — النتيجة تتعلن في الحفلة.", "Vote for the colleagues who deserve it — winners are announced at the event."),
    items: [
      { id: "c-award-peoples-choice", prompt: t("اختيار الجمهور", "People's choice") },
      { id: "c-award-team-spirit", prompt: t("أحلى روح فريق", "Best team spirit") },
      { id: "c-award-helping-hand", prompt: t("أكتر حد بيساعد زمايله", "The most helpful colleague") },
      { id: "c-award-best-idea", prompt: t("أحسن فكرة السنة دي", "Idea of the year") },
      { id: "c-award-newcomer", prompt: t("أحسن وجه جديد", "Best newcomer") },
      { id: "c-award-problem-solver", prompt: t("حلّال المشاكل", "The problem solver") },
      { id: "c-award-good-vibes", prompt: t("صاحب أحلى طاقة إيجابية", "The most positive energy") },
      { id: "c-award-presentation", prompt: t("أحسن عرض تقديمي", "Best presentation") },
      { id: "c-award-costume", prompt: t("أحلى لبس في الحفلة", "Best dressed at the event") },
      { id: "c-award-customer-hero", prompt: t("بطل خدمة العملاء", "Customer hero") },
    ],
  },

  teasers: {
    title: t("تلميحات قبل اليوم الكبير", "Teasers before the big day"),
    intro: t("كل كام يوم تلميح جديد — تابعوا.", "A new hint every few days — keep an eye out."),
    items: [
      { id: "c-tease-venue", text: t("المكان: أول ما توصلوا هتعرفوا ليه اخترناه.", "The venue: you'll see why we picked it the moment you arrive."), hostPrompt: t("ضيفوا تلميح عن المكان من غير ما تقولوا اسمه.", "Add a hint about the venue without naming it.") },
      { id: "c-tease-speaker", text: t("ضيف اليوم بدأ مشواره من أوضة صغيرة، ودلوقتي المجال كله عارف اسمه.", "Our guest started in one small room — today the whole industry knows the name."), hostPrompt: t("عدّلوا التلميح على قد ضيفكم.", "Tailor the hint to your speaker.") },
      { id: "c-tease-product", text: t("حاجة جديدة جاية… أخف، أسرع، وهتغيّر طريقة شغلنا.", "Something new is coming… lighter, faster, and it will change how we work."), hostPrompt: t("ممكن تضيفوا وصف لشكل المنتج من بعيد.", "You could describe the product's outline.") },
      { id: "c-tease-number", text: t("رقم واحد هيتعلن على المسرح… وهيخلّي الكل يسقّف.", "One number will be announced on stage… and everyone will be clapping."), hostPrompt: t("ضيفوا تلميح عن الرقم لو حابين.", "Add a hint about the number if you like.") },
      { id: "c-tease-surprise", text: t("جهّزوا نفسكم لفقرة محدش متوقعها بعد العشا.", "Get ready for a surprise nobody expects after dinner.") },
      { id: "c-tease-colour", text: t("لون واحد هيجمعنا كلنا يوم الحفلة — خمّنوا؟", "One colour will bring us all together on the day — any guesses?"), hostPrompt: t("اكشفوا اللون في آخر تلميح.", "Reveal the colour in the last teaser.") },
      { id: "c-tease-opening", text: t("أول فقرة هتبدأ بسؤال… والإجابة عندكم أنتم.", "The first session opens with a question… and you hold the answer.") },
      { id: "c-tease-last-call", text: t("الميعاد قرّب — راجعوا الدعوة وجهّزوا نفسكم.", "Almost time — check your invitation and get ready.") },
    ],
  },
};
