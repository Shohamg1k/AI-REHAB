import { UNREVIEWED_TRANSLATION_NOTE, type Locale } from "@ai-rehab/contracts";

/**
 * H9 — patient-facing UI strings.
 *
 * **Scope, stated plainly.** This covers the live session surface and the
 * voice settings card, not the whole app. The line is deliberate: *anything
 * spoken aloud, and anything that tells a patient to stop, is translated.*
 * Navigation, history and the clinician-facing surfaces are still English —
 * see docs/STATUS.md. Half-translating the safety sheet would have been the
 * worst outcome available: a patient coached in Hindi, then blocked in
 * English at the moment it matters most.
 *
 * The shape is a `Record<Locale, UiStrings>` rather than a bag of optional
 * keys so that adding a locale to LocaleSchema fails the typecheck until
 * every string exists. A missing translation should never be a runtime
 * fallback discovered by a patient.
 */
export type UiStrings = {
  safety: {
    escalateTitle: string;
    blockTitle: string;
    /** Template with `{name}`, `{observed}` and `{limit}` placeholders — see interpolate.tsx. */
    thresholdReached: string;
    ifItHurts: string;
    ifItHurtsBody: string;
    writtenToLog: string;
    escalated: string;
    blocked: string;
    reasonAttached: string;
    endExercise: string;
    escalateFooter: string;
    blockFooter: string;
  };
  cue: {
    captionNote: string;
  };
  session: {
    getIntoPosition: string;
    /** Spoken and shown the moment counting arms. */
    go: string;
    startingIn: string;
    /** Why the rep counter is sitting at zero during the countdown. */
    notCountingYet: string;
    setComplete: string;
  };
  settings: {
    title: string;
    language: string;
    voice: string;
    browserDefault: string;
    speed: string;
    slower: string;
    faster: string;
    test: string;
    sample: string;
    /** Shown when the device has no voice for the chosen language. */
    noVoice: (language: string) => string;
    /**
     * The unreviewed-translation caveat, in the language being warned about.
     * Showing it only in English would leave it unreadable by exactly the
     * patient it concerns.
     */
    unreviewedNote: string;
  };
};

const en: UiStrings = {
  safety: {
    escalateTitle: "Stop and check in with your clinician",
    blockTitle: "We stopped the set",
    thresholdReached: "{name} reached {observed} against a cap of {limit}.",
    ifItHurts: "If it hurts",
    ifItHurtsBody:
      "Stop and contact your clinician. If the pain is severe or you cannot bear weight, call your local emergency number. We will not ask you to carry on.",
    writtenToLog: "Written to your log",
    escalated: "Escalated",
    blocked: "Blocked",
    reasonAttached: "Reason attached · visible to your clinician",
    endExercise: "End this exercise",
    escalateFooter:
      "If this is a medical emergency, contact emergency services. Otherwise, message your clinician before your next session.",
    blockFooter: "You can try a different exercise, or come back to this one later."
  },
  cue: { captionNote: "spoken cue · always captioned" },
  session: {
    getIntoPosition: "Get into position",
    go: "Go",
    startingIn: "Starting in",
    notCountingYet: "Reps are not counted yet",
    setComplete: "Set complete"
  },
  settings: {
    title: "Coaching voice & language",
    language: "Language",
    voice: "Voice",
    browserDefault: "Browser default",
    speed: "Speaking speed",
    slower: "Slower",
    faster: "Faster",
    test: "Test voice",
    sample: "This is how your coaching will sound.",
    unreviewedNote: UNREVIEWED_TRANSLATION_NOTE,
    noVoice: (language) =>
      `This device has no ${language} voice installed. Cues will be shown in ${language} and spoken in English.`
  }
};

const es: UiStrings = {
  safety: {
    escalateTitle: "Para y consulta a tu fisioterapeuta",
    blockTitle: "Hemos parado la serie",
    thresholdReached: "{name} alcanzó {observed} frente a un límite de {limit}.",
    ifItHurts: "Si te duele",
    ifItHurtsBody:
      "Para y contacta con tu fisioterapeuta. Si el dolor es intenso o no puedes apoyar el peso, llama al número de emergencias de tu zona. No te pediremos que continúes.",
    writtenToLog: "Registrado en tu historial",
    escalated: "Derivado",
    blocked: "Bloqueado",
    reasonAttached: "Motivo adjunto · visible para tu fisioterapeuta",
    endExercise: "Terminar este ejercicio",
    escalateFooter:
      "Si se trata de una emergencia médica, llama a los servicios de emergencia. Si no, escribe a tu fisioterapeuta antes de la próxima sesión.",
    blockFooter: "Puedes probar otro ejercicio o volver a este más tarde."
  },
  cue: { captionNote: "señal hablada · siempre subtitulada" },
  session: {
    getIntoPosition: "Ponte en posición",
    go: "¡Ya!",
    startingIn: "Empezamos en",
    notCountingYet: "Todavía no se cuentan repeticiones",
    setComplete: "Serie completada"
  },
  settings: {
    title: "Voz e idioma del entrenamiento",
    language: "Idioma",
    voice: "Voz",
    browserDefault: "Predeterminada del navegador",
    speed: "Velocidad al hablar",
    slower: "Más lenta",
    faster: "Más rápida",
    test: "Probar voz",
    sample: "Así sonará tu entrenamiento.",
    unreviewedNote:
      "Estas traducciones aún no han sido revisadas por un hablante nativo. Si una señal suena rara, sigue el movimiento que ves en pantalla y consulta a tu fisioterapeuta.",
    noVoice: (language) =>
      `Este dispositivo no tiene ninguna voz en ${language}. Las señales se mostrarán en ${language} y se hablarán en inglés.`
  }
};

const hi: UiStrings = {
  safety: {
    escalateTitle: "रुकें और अपने फ़िज़ियोथेरेपिस्ट से बात करें",
    blockTitle: "हमने यह सेट रोक दिया है",
    thresholdReached: "{name} {observed} तक पहुँचा, जबकि सीमा {limit} है।",
    ifItHurts: "अगर दर्द हो",
    ifItHurtsBody:
      "रुकें और अपने फ़िज़ियोथेरेपिस्ट से संपर्क करें। अगर दर्द तेज़ है या आप वज़न नहीं सह पा रहे हैं, तो अपने स्थानीय आपातकालीन नंबर पर कॉल करें। हम आपसे जारी रखने के लिए नहीं कहेंगे।",
    writtenToLog: "आपके लॉग में दर्ज",
    escalated: "आगे भेजा गया",
    blocked: "रोका गया",
    reasonAttached: "कारण संलग्न · आपके फ़िज़ियोथेरेपिस्ट को दिखेगा",
    endExercise: "यह व्यायाम समाप्त करें",
    escalateFooter:
      "अगर यह चिकित्सीय आपातकाल है, तो आपातकालीन सेवाओं से संपर्क करें। अन्यथा, अगले सत्र से पहले अपने फ़िज़ियोथेरेपिस्ट को संदेश भेजें।",
    blockFooter: "आप कोई दूसरा व्यायाम आज़मा सकते हैं, या बाद में इस पर लौट सकते हैं।"
  },
  cue: { captionNote: "बोला गया संकेत · हमेशा कैप्शन के साथ" },
  session: {
    getIntoPosition: "अपनी जगह पर आ जाएँ",
    go: "शुरू करें",
    startingIn: "शुरू होने में",
    notCountingYet: "अभी गिनती शुरू नहीं हुई है",
    setComplete: "सेट पूरा हुआ"
  },
  settings: {
    title: "कोचिंग की आवाज़ और भाषा",
    language: "भाषा",
    voice: "आवाज़",
    browserDefault: "ब्राउज़र की डिफ़ॉल्ट",
    speed: "बोलने की गति",
    slower: "धीमी",
    faster: "तेज़",
    test: "आवाज़ जाँचें",
    sample: "आपकी कोचिंग ऐसी सुनाई देगी।",
    unreviewedNote:
      "इन अनुवादों की जाँच अभी तक किसी धाराप्रवाह बोलने वाले ने नहीं की है। अगर कोई संकेत अटपटा लगे, तो स्क्रीन पर दिख रहे मूवमेंट का पालन करें और अपने फ़िज़ियोथेरेपिस्ट से पूछें।",
    noVoice: (language) =>
      `इस डिवाइस में ${language} की कोई आवाज़ नहीं है। संकेत ${language} में दिखाए जाएँगे और अंग्रेज़ी में बोले जाएँगे।`
  }
};

const fr: UiStrings = {
  safety: {
    escalateTitle: "Arrêtez et contactez votre kinésithérapeute",
    blockTitle: "Nous avons arrêté la série",
    thresholdReached: "{name} a atteint {observed} pour une limite de {limit}.",
    ifItHurts: "Si vous avez mal",
    ifItHurtsBody:
      "Arrêtez et contactez votre kinésithérapeute. Si la douleur est forte ou si vous ne pouvez pas prendre appui, appelez votre numéro d'urgence local. Nous ne vous demanderons pas de continuer.",
    writtenToLog: "Enregistré dans votre journal",
    escalated: "Signalé",
    blocked: "Bloqué",
    reasonAttached: "Motif joint · visible par votre kinésithérapeute",
    endExercise: "Terminer cet exercice",
    escalateFooter:
      "En cas d'urgence médicale, appelez les services d'urgence. Sinon, écrivez à votre kinésithérapeute avant votre prochaine séance.",
    blockFooter: "Vous pouvez essayer un autre exercice, ou revenir à celui-ci plus tard."
  },
  cue: { captionNote: "consigne vocale · toujours sous-titrée" },
  session: {
    getIntoPosition: "Mettez-vous en position",
    go: "C'est parti",
    startingIn: "Départ dans",
    notCountingYet: "Les répétitions ne sont pas encore comptées",
    setComplete: "Série terminée"
  },
  settings: {
    title: "Voix et langue du coaching",
    language: "Langue",
    voice: "Voix",
    browserDefault: "Par défaut du navigateur",
    speed: "Vitesse de parole",
    slower: "Plus lente",
    faster: "Plus rapide",
    test: "Tester la voix",
    sample: "Voici comment sonneront vos consignes.",
    unreviewedNote:
      "Ces traductions n'ont pas encore été relues par une personne parlant couramment la langue. Si une consigne semble étrange, suivez le mouvement affiché à l'écran et demandez à votre kinésithérapeute.",
    noVoice: (language) =>
      `Cet appareil n'a aucune voix en ${language}. Les consignes seront affichées en ${language} et prononcées en anglais.`
  }
};

const STRINGS: Record<Locale, UiStrings> = { en, es, hi, fr };

export function strings(locale: Locale): UiStrings {
  return STRINGS[locale] ?? en;
}
