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
      es: "Dobla un poco más — acerca la mano al hombro, y estira del todo al bajar.",
      hi: "थोड़ा और मोड़ें — हाथ को कंधे के पास लाएँ, और नीचे आते समय पूरा सीधा करें।",
      fr: "Pliez un peu plus — rapprochez votre main de votre épaule, et tendez complètement en redescendant."
    },
  "Bring your head all the way back to centre before the next tilt.": {
    es: "Vuelve con la cabeza hasta el centro antes de la siguiente inclinación.",
    hi: "अगली बार झुकाने से पहले सिर को पूरी तरह बीच में वापस लाएँ।",
    fr: "Ramenez complètement la tête au centre avant l'inclinaison suivante."
  },
  "Keep your body still — let the arm do the work, not your back.": {
    es: "Mantén el cuerpo quieto — que trabaje el brazo, no la espalda.",
    hi: "शरीर को स्थिर रखें — काम बाँह से लें, पीठ से नहीं।",
    fr: "Gardez le corps immobile — laissez le bras travailler, pas le dos."
  },
  "Keep your body upright and still — move only your head.": {
    es: "Mantén el cuerpo erguido y quieto — mueve solo la cabeza.",
    hi: "शरीर को सीधा और स्थिर रखें — सिर्फ़ सिर हिलाएँ।",
    fr: "Gardez le corps droit et immobile — bougez uniquement la tête."
  },
  "Keep your elbow straight as you lift — don't let the arm fold.": {
    es: "Mantén el codo estirado al levantar — no dejes que el brazo se doble.",
    hi: "उठाते समय कोहनी सीधी रखें — बाँह को मुड़ने न दें।",
    fr: "Gardez le coude tendu en levant — ne laissez pas le bras se plier."
  },
  "Keep your trunk upright — avoid leaning away as you lift.": {
    es: "Mantén el tronco erguido — evita inclinarte hacia el lado al levantar.",
    hi: "धड़ को सीधा रखें — उठाते समय दूसरी ओर झुकने से बचें।",
    fr: "Gardez le tronc droit — évitez de vous pencher sur le côté en levant."
  },
  "Lower back down as slowly as you lifted — don't let it drop.": {
    es: "Baja tan despacio como subiste — no lo dejes caer.",
    hi: "जितनी धीरे उठाया था उतनी ही धीरे नीचे लाएँ — गिरने न दें।",
    fr: "Redescendez aussi lentement que vous avez monté — ne laissez pas retomber."
  },
  "Lower your arm as slowly as you raised it — don't let it drop.": {
    es: "Baja el brazo tan despacio como lo subiste — no lo dejes caer.",
    hi: "बाँह को जितनी धीरे उठाया था उतनी ही धीरे नीचे लाएँ — गिरने न दें।",
    fr: "Abaissez le bras aussi lentement que vous l'avez levé — ne le laissez pas retomber."
  },
  "Lower your hand as slowly as you raised it — don't let it drop.": {
    es: "Baja la mano tan despacio como la subiste — no la dejes caer.",
    hi: "हाथ को जितनी धीरे उठाया था उतनी ही धीरे नीचे लाएँ — गिरने न दें।",
    fr: "Abaissez la main aussi lentement que vous l'avez levée — ne la laissez pas retomber."
  },
  "No need to go past shoulder height — bring it back down a touch.": {
    es: "No hace falta pasar de la altura del hombro — bájalo un poco.",
    hi: "कंधे की ऊँचाई से ऊपर जाने की ज़रूरत नहीं — इसे थोड़ा नीचे लाएँ।",
    fr: "Inutile de dépasser la hauteur de l'épaule — redescendez un peu."
  },
  "No need to raise past shoulder height — bring it back down a touch.": {
    es: "No hace falta subir por encima del hombro — bájalo un poco.",
    hi: "कंधे की ऊँचाई से ऊपर उठाने की ज़रूरत नहीं — इसे थोड़ा नीचे लाएँ।",
    fr: "Inutile de lever au-dessus de l'épaule — redescendez un peu."
  },
  "Push all the way up to standing — straighten your hips fully.": {
    es: "Sube del todo hasta ponerte de pie — estira bien las caderas.",
    hi: "पूरी तरह खड़े हो जाएँ — कूल्हों को पूरा सीधा करें।",
    fr: "Montez complètement debout — tendez bien les hanches."
  },
  "Raise your arm a little higher, out to the side.": {
    es: "Sube el brazo un poco más, hacia el lado.",
    hi: "बाँह को बगल की ओर थोड़ा और ऊपर उठाएँ।",
    fr: "Levez le bras un peu plus haut, sur le côté."
  },
  "Raise your arm a little higher, straight out in front of you.": {
    es: "Sube el brazo un poco más, recto hacia delante.",
    hi: "बाँह को सामने की ओर सीधा, थोड़ा और ऊपर उठाएँ।",
    fr: "Levez le bras un peu plus haut, droit devant vous."
  },
  "Sit tall — avoid leaning back to help lift your leg.": {
    es: "Siéntate erguido — evita echarte hacia atrás para ayudar a subir la pierna.",
    hi: "सीधे बैठें — पैर उठाने के लिए पीछे झुकने से बचें।",
    fr: "Asseyez-vous bien droit — évitez de vous pencher en arrière pour aider la jambe."
  },
  "Slow down — bend with control instead of swinging the weight up.": {
    es: "Más despacio — dobla con control en vez de impulsar el peso.",
    hi: "धीरे करें — वज़न को झटके से ऊपर लाने के बजाय नियंत्रण के साथ मोड़ें।",
    fr: "Ralentissez — pliez avec contrôle au lieu de lancer la charge."
  },
  "Slow down — control the movement instead of kicking it up.": {
    es: "Más despacio — controla el movimiento en vez de dar una patada.",
    hi: "धीरे करें — झटके से ऊपर करने के बजाय गति को नियंत्रित करें।",
    fr: "Ralentissez — contrôlez le mouvement au lieu de le lancer d'un coup."
  },
  "Slow down — control the stand instead of launching up.": {
    es: "Más despacio — controla el movimiento al levantarte en vez de impulsarte.",
    hi: "धीरे करें — झटके से उठने के बजाय खड़े होने को नियंत्रित करें।",
    fr: "Ralentissez — contrôlez le lever au lieu de vous propulser."
  },
  "Slow down — lift with control instead of swinging your arm up.": {
    es: "Más despacio — sube con control en vez de lanzar el brazo.",
    hi: "धीरे करें — बाँह को झटके से ऊपर करने के बजाय नियंत्रण के साथ उठाएँ।",
    fr: "Ralentissez — levez avec contrôle au lieu de lancer le bras."
  },
  "Slow down — lift with control instead of swinging your arm.": {
    es: "Más despacio — sube con control en vez de balancear el brazo.",
    hi: "धीरे करें — बाँह को झुलाने के बजाय नियंत्रण के साथ उठाएँ।",
    fr: "Ralentissez — levez avec contrôle au lieu de balancer le bras."
  },
  "Slow the movement down — smooth and steady, never forced.": {
    es: "Haz el movimiento más despacio — suave y constante, nunca forzado.",
    hi: "गति धीमी करें — सहज और स्थिर, कभी ज़ोर लगाकर नहीं।",
    fr: "Ralentissez le mouvement — souple et régulier, jamais forcé."
  },
  "Stay upright — don't lean back to help the arm up.": {
    es: "Mantente erguido — no te eches hacia atrás para ayudar a subir el brazo.",
    hi: "सीधे रहें — बाँह ऊपर करने के लिए पीछे न झुकें।",
    fr: "Restez droit — ne vous penchez pas en arrière pour aider le bras."
  },
  "Straighten your knees fully at the top.": {
    es: "Estira las rodillas del todo arriba.",
    hi: "ऊपर पहुँचकर घुटनों को पूरी तरह सीधा करें।",
    fr: "Tendez complètement les genoux en haut."
  },
  "Take your ear a little closer to your shoulder, only as far as is comfortable.": {
    es: "Acerca la oreja un poco más al hombro, solo hasta donde resulte cómodo.",
    hi: "कान को कंधे के थोड़ा और पास लाएँ, सिर्फ़ उतना ही जितना आरामदायक लगे।",
    fr: "Rapprochez un peu plus l'oreille de l'épaule, seulement jusqu'où c'est confortable."
  },
  "Take your time — there's no benefit to moving quickly here.": {
    es: "Tómate tu tiempo — aquí no hay ningún beneficio en ir rápido.",
    hi: "आराम से करें — यहाँ तेज़ी से करने का कोई फ़ायदा नहीं है।",
    fr: "Prenez votre temps — aller vite n'apporte rien ici."
  },
  "That's far enough — ease back a little. This should never be forced.": {
    es: "Ya es suficiente — vuelve un poco atrás. Esto nunca debe forzarse.",
    hi: "इतना काफ़ी है — थोड़ा वापस आएँ। इसे कभी ज़ोर लगाकर नहीं करना चाहिए।",
    fr: "C'est suffisant — revenez un peu en arrière. Cela ne doit jamais être forcé."
  },
  "Try leaning forward a little less — use your legs more than momentum.": {
    es: "Intenta inclinarte un poco menos hacia delante — usa más las piernas que el impulso.",
    hi: "आगे थोड़ा कम झुकने की कोशिश करें — झटके के बजाय पैरों का ज़्यादा इस्तेमाल करें।",
    fr: "Penchez-vous un peu moins en avant — utilisez vos jambes plutôt que l'élan."
  },
  "Try not to pause too long partway up.": {
    es: "Intenta no pararte demasiado a mitad de la subida.",
    hi: "ऊपर जाते समय बीच में ज़्यादा देर न रुकें।",
    fr: "Essayez de ne pas marquer une longue pause à mi-hauteur."
  },
  "Try to keep the movement flowing without a long pause.": {
    es: "Intenta que el movimiento siga fluido, sin una pausa larga.",
    hi: "गति को बिना लंबे विराम के लगातार बनाए रखने की कोशिश करें।",
    fr: "Essayez de garder le mouvement fluide, sans longue pause."
  },
  "Try to move at one steady speed rather than in bursts.": {
    es: "Intenta moverte a una velocidad constante en vez de a tirones.",
    hi: "झटकों के बजाय एक समान गति से चलने की कोशिश करें।",
    fr: "Essayez de bouger à une vitesse régulière plutôt que par à-coups."
  },
  "Try to straighten your knee a bit more at the top.": {
    es: "Intenta estirar un poco más la rodilla arriba.",
    hi: "ऊपर पहुँचकर घुटने को थोड़ा और सीधा करने की कोशिश करें।",
    fr: "Essayez de tendre un peu plus le genou en haut."
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
