import { DEFAULT_LOCALE, type Locale } from "@ai-rehab/contracts";

/**
 * H9 — translations of the cue text in the exercise specs.
 *
 * **Why this is data and not a model call.** Cue text is spoken inside a set,
 * which is the fast loop, and ADR-0001 forbids a model call there. Translating
 * at runtime would also make coaching depend on the network, in the one part
 * of the app that has to keep working when it drops. So translations are
 * authored, shipped, and looked up in constant time — the same posture as the
 * English cue text itself (A6: an exercise is data).
 *
 * **Why the key is the English string and not a cue id.** Keying by
 * `exerciseId:cueId` would survive an edit to the English copy — which sounds
 * like an advantage and is in fact the failure mode. Someone rewrites an
 * English cue, the Spanish entry keeps its old wording, and a Spanish-speaking
 * patient is coached with text that no longer matches what the cue means.
 * Keying by source text makes that edit a *miss*: the lookup falls back to
 * English, and `cueCatalogue.test.ts` fails until the translation is redone.
 * Losing a translation is recoverable. Silently serving a wrong one is not.
 *
 * Every non-English string here was produced without a fluent reviewer. See
 * UNREVIEWED_TRANSLATION_NOTE, which the UI renders next to the picker.
 */
type TranslationsFor = Record<Exclude<Locale, "en">, string>;

export const CUE_TRANSLATIONS: Readonly<Record<string, TranslationsFor>> = {
  "Bend a little further — bring your hand closer to your shoulder, and straighten fully on the way down.":
    {
      hi: "थोड़ा और मोड़ें — हाथ को कंधे के पास लाएँ, और नीचे आते समय पूरा सीधा करें।"
    },
  "Bring your head all the way back to centre before the next tilt.": {
    hi: "अगली बार झुकाने से पहले सिर को पूरी तरह बीच में वापस लाएँ।"
  },
  "Keep your body still — let the arm do the work, not your back.": {
    hi: "शरीर को स्थिर रखें — काम बाँह से लें, पीठ से नहीं।"
  },
  "Keep your body upright and still — move only your head.": {
    hi: "शरीर को सीधा और स्थिर रखें — सिर्फ़ सिर हिलाएँ।"
  },
  "Keep your elbow straight as you lift — don't let the arm fold.": {
    hi: "उठाते समय कोहनी सीधी रखें — बाँह को मुड़ने न दें।"
  },
  "Keep your trunk upright — avoid leaning away as you lift.": {
    hi: "धड़ को सीधा रखें — उठाते समय दूसरी ओर झुकने से बचें।"
  },
  "Lower back down as slowly as you lifted — don't let it drop.": {
    hi: "जितनी धीरे उठाया था उतनी ही धीरे नीचे लाएँ — गिरने न दें।"
  },
  "Lower your arm as slowly as you raised it — don't let it drop.": {
    hi: "बाँह को जितनी धीरे उठाया था उतनी ही धीरे नीचे लाएँ — गिरने न दें।"
  },
  "Lower your hand as slowly as you raised it — don't let it drop.": {
    hi: "हाथ को जितनी धीरे उठाया था उतनी ही धीरे नीचे लाएँ — गिरने न दें।"
  },
  "No need to go past shoulder height — bring it back down a touch.": {
    hi: "कंधे की ऊँचाई से ऊपर जाने की ज़रूरत नहीं — इसे थोड़ा नीचे लाएँ।"
  },
  "No need to raise past shoulder height — bring it back down a touch.": {
    hi: "कंधे की ऊँचाई से ऊपर उठाने की ज़रूरत नहीं — इसे थोड़ा नीचे लाएँ।"
  },
  "Push all the way up to standing — straighten your hips fully.": {
    hi: "पूरी तरह खड़े हो जाएँ — कूल्हों को पूरा सीधा करें।"
  },
  "Raise your arm a little higher, out to the side.": {
    hi: "बाँह को बगल की ओर थोड़ा और ऊपर उठाएँ।"
  },
  "Raise your arm a little higher, straight out in front of you.": {
    hi: "बाँह को सामने की ओर सीधा, थोड़ा और ऊपर उठाएँ।"
  },
  "Sit tall — avoid leaning back to help lift your leg.": {
    hi: "सीधे बैठें — पैर उठाने के लिए पीछे झुकने से बचें।"
  },
  "Slow down — bend with control instead of swinging the weight up.": {
    hi: "धीरे करें — वज़न को झटके से ऊपर लाने के बजाय नियंत्रण के साथ मोड़ें।"
  },
  "Slow down — control the movement instead of kicking it up.": {
    hi: "धीरे करें — झटके से ऊपर करने के बजाय गति को नियंत्रित करें।"
  },
  "Slow down — control the stand instead of launching up.": {
    hi: "धीरे करें — झटके से उठने के बजाय खड़े होने को नियंत्रित करें।"
  },
  "Slow down — lift with control instead of swinging your arm up.": {
    hi: "धीरे करें — बाँह को झटके से ऊपर करने के बजाय नियंत्रण के साथ उठाएँ।"
  },
  "Slow down — lift with control instead of swinging your arm.": {
    hi: "धीरे करें — बाँह को झुलाने के बजाय नियंत्रण के साथ उठाएँ।"
  },
  "Slow the movement down — smooth and steady, never forced.": {
    hi: "गति धीमी करें — सहज और स्थिर, कभी ज़ोर लगाकर नहीं।"
  },
  "Stay upright — don't lean back to help the arm up.": {
    hi: "सीधे रहें — बाँह ऊपर करने के लिए पीछे न झुकें।"
  },
  "Straighten your knees fully at the top.": {
    hi: "ऊपर पहुँचकर घुटनों को पूरी तरह सीधा करें।"
  },
  "Take your ear a little closer to your shoulder, only as far as is comfortable.": {
    hi: "कान को कंधे के थोड़ा और पास लाएँ, सिर्फ़ उतना ही जितना आरामदायक लगे।"
  },
  "Take your time — there's no benefit to moving quickly here.": {
    hi: "आराम से करें — यहाँ तेज़ी से करने का कोई फ़ायदा नहीं है।"
  },
  "That's far enough — ease back a little. This should never be forced.": {
    hi: "इतना काफ़ी है — थोड़ा वापस आएँ। इसे कभी ज़ोर लगाकर नहीं करना चाहिए।"
  },
  "Try leaning forward a little less — use your legs more than momentum.": {
    hi: "आगे थोड़ा कम झुकने की कोशिश करें — झटके के बजाय पैरों का ज़्यादा इस्तेमाल करें।"
  },
  "Try not to pause too long partway up.": {
    hi: "ऊपर जाते समय बीच में ज़्यादा देर न रुकें।"
  },
  "Try to keep the movement flowing without a long pause.": {
    hi: "गति को बिना लंबे विराम के लगातार बनाए रखने की कोशिश करें।"
  },
  "Try to move at one steady speed rather than in bursts.": {
    hi: "झटकों के बजाय एक समान गति से चलने की कोशिश करें।"
  },
  "Try to straighten your knee a bit more at the top.": {
    hi: "ऊपर पहुँचकर घुटने को थोड़ा और सीधा करने की कोशिश करें।"
  }
};

/**
 * Translate a cue for display and speech. Falls back to the English source
 * text — never to an empty string, because the caller is about to coach
 * someone mid-movement and silence is the one unacceptable answer.
 */
export function localiseCue(text: string, locale: Locale): string {
  if (locale === DEFAULT_LOCALE) return text;
  const entry = CUE_TRANSLATIONS[text];
  if (!entry) return text;
  return entry[locale] ?? text;
}
