import { slots, t, type GenderRevealBank } from "./types";

export const genderRevealBank: GenderRevealBank = {
  clues: {
    title: t("حكاوي الجدّات", "Old wives' tales"),
    intro: t("دي حكاوي جدّاتنا للتسلية بس، مش كلام دكاترة — شوف العلامات وقرّر تيمك.", "Grandma's folklore, just for fun — not medical advice. Read the signs and pick your team."),
    items: [
      { id: "g-clue-bump-shape", text: t("بيقولوا: البطن العالية المدوّرة بنت، والواطية المدبّبة لقدّام ولد.", "They say: a high, round bump means a girl; a low, pointed one means a boy."), hostPrompt: t("بطن ماما شكلها إيه؟", "What does mum's bump look like?") },
      { id: "g-clue-cravings", text: t("بيقولوا: وحم الحادق والمخلل ولد، ووحم الحلو بنت.", "They say: craving salty and sour means a boy; craving sweets means a girl."), hostPrompt: t("ماما وحمها على إيه؟", "What is mum craving?") },
      { id: "g-clue-morning-sickness", text: t("بيقولوا: دوخة الصبح الكتير في الشهور الأولى معناها بنت، والحمل الهادي ولد.", "They say: lots of morning sickness early on means a girl; an easy start means a boy."), hostPrompt: t("الشهور الأولى كانت عاملة إزاي؟", "How were the first months?") },
      { id: "g-clue-ring", text: t("علّقوا خاتم في خيط فوق البطن: لو راح وجه ولد، ولو لفّ دواير بنت.", "Hang a ring on a thread over the bump: back and forth means a boy; circles mean a girl."), hostPrompt: t("جرّبتوها؟ الخاتم عمل إيه؟", "Did you try it? What did the ring do?") },
      { id: "g-clue-heartbeat", text: t("بيقولوا: نبض البيبي السريع بنت، والأهدى ولد.", "They say: a fast baby heartbeat means a girl; a calmer one means a boy."), hostPrompt: t("النبض في آخر كشف كان سريع ولا هادي؟", "Was the heartbeat fast or calm at the last check-up?") },
      { id: "g-clue-sleep-side", text: t("بيقولوا: اللي بتنام على جنبها الشمال هتجيب ولد، وعلى اليمين بنت.", "They say: sleeping on the left side means a boy; on the right, a girl."), hostPrompt: t("ماما بتنام على أنهي جنب؟", "Which side does mum sleep on?") },
      { id: "g-clue-cold-feet", text: t("بيقولوا: رجلين ماما الدافية بنت، والساقعة على طول ولد.", "They say: warm feet mean a girl; feet that are always cold mean a boy."), hostPrompt: t("رجلين ماما ساقعة ولا دافية؟", "Are mum's feet cold or warm?") },
      { id: "g-clue-first-step", text: t("بيقولوا: لو ماما بتبدأ المشي برجلها اليمين ولد، وبالشمال بنت.", "They say: if mum steps off with her right foot it's a boy; with her left, a girl."), hostPrompt: t("ماما بتبدأ بأنهي رجل؟", "Which foot does mum start with?") },
      { id: "g-clue-key", text: t("حطّوا مفتاح قدام ماما: لو مسكته من الطرف الرفيع بنت، ومن الراس المدوّرة ولد.", "Put a key in front of mum: picking it up by the narrow end means a girl; by the round head, a boy."), hostPrompt: t("ماما مسكت المفتاح منين؟", "How did mum pick up the key?") },
      { id: "g-clue-dad-weight", text: t("بيقولوا: لو بابا زاد في الوزن مع ماما تبقى بنت، ولو فضل زي ما هو يبقى ولد.", "They say: if dad gains weight along with mum it's a girl; if he stays the same, a boy."), hostPrompt: t("بابا زاد كام كيلو؟", "How much weight has dad put on?") },
      { id: "g-clue-dreams", text: t("بيقولوا الأحلام بالعكس: اللي تحلم بولد تجيب بنت، واللي تحلم ببنت تجيب ولد!", "They say dreams run backwards: dream of a boy and it's a girl; dream of a girl and it's a boy!"), hostPrompt: t("ماما حلمت بإيه؟", "What did mum dream of?") },
      { id: "g-clue-kicks", text: t("بيقولوا: البيبي الهادي بنت، واللي بيرفس طول الليل ولد.", "They say: a calm baby is a girl; one who kicks all night is a boy."), hostPrompt: t("البيبي بيتحرك قد إيه؟", "How much does the baby move?") },
      { id: "g-clue-hands", text: t("قولوا لماما «وريني إيدك»: لو مدّتها وكفّها لتحت ولد، ولفوق بنت.", "Ask mum to show her hands: palms down means a boy; palms up, a girl."), hostPrompt: t("ماما مدّت إيدها إزاي؟", "How did mum hold out her hands?") },
      { id: "g-clue-salt", text: t("رشّوا شوية ملح على راس ماما من غير ما تاخد بالها: لو حكّت بُقها بنت، ولو حكّت مناخيرها ولد.", "Sprinkle a little salt on mum's head when she isn't looking: if she touches her mouth it's a girl; her nose, a boy."), hostPrompt: t("جرّبتوا الملح؟ حصل إيه؟", "Did you try the salt? What happened?") },
      { id: "g-clue-toddler", text: t("بيقولوا: لو ولد صغير اتعلّق بماما تبقى بنت، ولو بنوتة صغيرة اتعلّقت بيها يبقى ولد.", "They say: if a little boy is drawn to mum it's a girl; if a little girl is, it's a boy."), hostPrompt: t("مين من أطفال العيلة لازق في ماما؟", "Which little one in the family won't leave mum's side?") },
      { id: "g-clue-calendar", text: t("الجدول الصيني القديم بيحسبها بسن ماما وشهر الحمل — وكل تيتة عندها حسبتها.", "The old Chinese chart works it out from mum's age and the month — and every grandma has her own sums."), hostPrompt: t("الجدول طلّع إيه؟", "What did the chart say?") },
    ],
  },

  quiz: {
    title: t("مين عارف بابا وماما أكتر؟", "Who knows the parents best?"),
    intro: t("أسئلة عن بابا وماما — كل إجابة صح بنقط لتيمك.", "Questions about mum and dad — every right answer scores for your team."),
    items: [
      { id: "g-quiz-first-meet", prompt: t("بابا وماما اتقابلوا أول مرة فين؟", "Where did mum and dad first meet?"), options: [t("في الشغل", "At work"), t("في الجامعة", "At university"), t("عن طريق صحاب", "Through friends"), t("في مناسبة عائلية", "At a family gathering")] },
      { id: "g-quiz-craving", prompt: t("ماما وحمها كان على إيه؟", "What has mum been craving?"), options: [t("مانجة", "Mango"), t("مخلل", "Pickles"), t("شوكولاتة", "Chocolate"), t("آيس كريم", "Ice cream")] },
      { id: "g-quiz-first-to-know", prompt: t("مين أول واحد عرف خبر الحمل بعد بابا وماما؟", "Who heard the news first after mum and dad?"), options: [t("تيتة", "Grandma"), t("خالتو", "Mum's sister"), t("عمّتو", "Dad's sister"), t("أعز صاحبة", "Mum's best friend")] },
      { id: "g-quiz-dad-reaction", prompt: t("بابا عمل إيه لما عرف الخبر؟", "What did dad do when he heard?"), options: [t("دمّع من الفرحة", "Teared up with joy"), t("فضل يضحك", "Couldn't stop laughing"), t("سكت من المفاجأة", "Went quiet with surprise"), t("كلّم العيلة كلها", "Called the whole family")] },
      { id: "g-quiz-nursery", prompt: t("مين اللي جهّز أوضة البيبي؟", "Who set up the baby's room?"), options: [t("بابا", "Dad"), t("ماما", "Mum"), t("الاتنين سوا", "Both together"), t("لسه ما اتجهّزتش", "It isn't ready yet")] },
      { id: "g-quiz-first-buy", prompt: t("أول حاجة اشتروها للبيبي؟", "What was the first thing they bought for the baby?"), options: [t("سرير", "A cot"), t("هدوم", "Clothes"), t("عربية أطفال", "A pram"), t("لعبة", "A toy")] },
      { id: "g-quiz-mum-as-kid", prompt: t("ماما وهي صغيرة كانت عاملة إزاي؟", "What was mum like as a child?"), options: [t("هادية", "Quiet"), t("شقية", "Mischievous"), t("دلوعة", "The family's darling"), t("شاطرة في المذاكرة", "Top of the class")] },
      { id: "g-quiz-dad-as-kid", prompt: t("بابا وهو صغير كان عامل إزاي؟", "What was dad like as a child?"), options: [t("هادي", "Quiet"), t("شقي", "Mischievous"), t("بتاع كورة", "Football-mad"), t("شاطر في المذاكرة", "Top of the class")] },
      { id: "g-quiz-married-for", prompt: t("بابا وماما متجوزين بقالهم قد إيه؟", "How long have mum and dad been married?"), options: [t("أقل من سنة", "Less than a year"), t("من سنة لسنتين", "One to two years"), t("من ٣ لـ٥ سنين", "Three to five years"), t("أكتر من ٥ سنين", "More than five years")] },
      { id: "g-quiz-needles", prompt: t("مين فيهم بيخاف من الحقن؟", "Which of them is scared of needles?"), options: [t("بابا", "Dad"), t("ماما", "Mum"), t("الاتنين", "Both"), t("ولا واحد", "Neither")] },
      { id: "g-quiz-bump-name", prompt: t("بيدلّعوا البيبي وهو في البطن بإيه؟", "What do they call the bump?"), options: slots(4, "الاسم", "Name") },
      { id: "g-quiz-dad-team", prompt: t("بابا نفسه البيبي يشجّع مين؟", "Which team does dad hope the baby will support?"), options: [t("الأهلي", "Al Ahly"), t("الزمالك", "Zamalek"), t("فريق تاني", "Another team"), t("مش فارقة معاه", "He doesn't mind")] },
      { id: "g-quiz-bump-playlist", prompt: t("ماما بتسمّع البيبي إيه؟", "What does mum play for the baby?"), options: [t("قرآن", "Qur'an"), t("أغاني أطفال", "Nursery songs"), t("مزيكا هادية", "Calm music"), t("صوت بابا", "Dad's voice")] },
      { id: "g-quiz-who-reads", prompt: t("مين اللي قرا كتب عن تربية الأطفال؟", "Who has been reading the parenting books?"), options: [t("بابا", "Dad"), t("ماما", "Mum"), t("الاتنين", "Both"), t("هيسألوا تيتة", "They'll ask grandma")] },
    ],
  },

  predictions: {
    title: t("توقعات البيبي", "Baby predictions"),
    intro: t("اكتب توقعاتك، وأقرب واحد يكسب بعد ما البيبي يشرّف.", "Write your guesses — the closest wins once the baby arrives."),
    items: [
      { id: "g-pred-weight", prompt: t("وزن البيبي يوم الولادة؟", "The baby's weight at birth?"), answer: { type: "number", min: 1.5, max: 5.5, unit: t("كجم", "kg"), tolerance: 0.2 } },
      { id: "g-pred-birth-date", prompt: t("البيبي هيشرّف يوم كام؟", "What day will the baby arrive?"), answer: { type: "time", format: "date", tolerance: 3 } },
      { id: "g-pred-birth-time", prompt: t("هيتولد الساعة كام؟", "What time will the baby be born?"), answer: { type: "time", format: "clock", tolerance: 60 } },
      { id: "g-pred-looks-like", prompt: t("البيبي هيطلع شبه مين؟", "Who will the baby look like?"), answer: { type: "choice", options: [t("بابا", "Dad"), t("ماما", "Mum"), t("خليط من الاتنين", "A mix of both"), t("تيتة أو جدو", "A grandparent")] } },
      { id: "g-pred-length", prompt: t("طول البيبي يوم الولادة؟", "The baby's length at birth?"), answer: { type: "number", min: 40, max: 60, unit: t("سم", "cm"), tolerance: 1 } },
      { id: "g-pred-hair", prompt: t("شعر البيبي هيبقى عامل إزاي؟", "How much hair will the baby have?"), answer: { type: "choice", options: [t("شعر كتير", "A full head of hair"), t("شعر خفيف", "A little fuzz"), t("من غير شعر خالص", "None at all")] } },
      { id: "g-pred-eyes", prompt: t("لون عيون البيبي؟", "The baby's eye colour?"), answer: { type: "choice", options: [t("بني", "Brown"), t("عسلي", "Hazel"), t("أخضر", "Green"), t("أزرق", "Blue")] } },
      { id: "g-pred-first-hold", prompt: t("مين هيشيل البيبي الأول بعد بابا وماما؟", "Who will hold the baby first after mum and dad?"), answer: { type: "choice", options: [t("تيتة أم ماما", "Mum's mother"), t("تيتة أم بابا", "Dad's mother"), t("خالتو", "Mum's sister"), t("عمّتو", "Dad's sister")] } },
      { id: "g-pred-due-date", prompt: t("البيبي هييجي قبل ميعاده ولا بعده؟", "Will the baby come early or late?"), answer: { type: "choice", options: [t("قبل الميعاد", "Early"), t("في الميعاد بالظبط", "Right on time"), t("بعد الميعاد", "Late")] } },
      { id: "g-pred-first-word", prompt: t("أول كلمة هيقولها؟", "What will the baby's first word be?"), answer: { type: "choice", options: [t("بابا", "Baba"), t("ماما", "Mama"), t("تيتة", "Teta"), t("كلمة تانية خالص", "Something else entirely")] } },
    ],
  },

  namePolls: {
    title: t("نسمّي البيبي إيه؟", "What shall we name the baby?"),
    intro: t("ساعدوا بابا وماما في أحلى اختيار.", "Help mum and dad with the sweetest choice."),
    items: [
      { id: "g-name-if-girl", prompt: t("لو بنت، أنهي اسم أحلى؟", "If it's a girl, which name do you love?"), options: slots(4, "الاسم", "Name") },
      { id: "g-name-if-boy", prompt: t("لو ولد، أنهي اسم أحلى؟", "If it's a boy, which name do you love?"), options: slots(4, "الاسم", "Name") },
      { id: "g-name-style", prompt: t("اسم قديم أصيل ولا اسم جديد؟", "A classic name or a modern one?"), options: [t("قديم وأصيل", "Classic"), t("جديد ومودرن", "Modern"), t("الاتنين حلوين", "Either is lovely")] },
      { id: "g-name-family", prompt: t("على اسم حد من العيلة ولا اسم جديد علينا؟", "A family name or one that's new to us?"), options: [t("على اسم جدو أو تيتة", "After a grandparent"), t("اسم جديد على العيلة", "New to the family")] },
      { id: "g-name-length", prompt: t("اسم قصير وخفيف ولا اسم طويل؟", "A short name or a long one?"), options: [t("قصير وخفيف", "Short and sweet"), t("طويل وله رنّة", "Long with a ring to it")] },
      { id: "g-name-who-decides", prompt: t("مين له الكلمة الأخيرة في الاسم؟", "Who gets the final say on the name?"), options: [t("بابا", "Dad"), t("ماما", "Mum"), t("تيتة", "Grandma"), t("يتفقوا سوا", "They agree together")] },
      { id: "g-name-nickname", prompt: t("أحلى اسم دلع؟", "The cutest nickname?"), options: slots(4, "اسم الدلع", "Nickname") },
    ],
  },
};
