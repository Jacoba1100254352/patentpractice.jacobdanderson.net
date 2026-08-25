const EDUCATIONAL_BOUNDARY = Object.freeze({
  short:
    "ScopeCraft is a drafting and issue-spotting simulator. Results are limited to this fixed challenge record.",
  full:
    "This exercise is educational. It is not legal advice and does not provide a patentability, validity, infringement, or freedom-to-operate opinion. A simulated result reports only what happened under the stipulated facts, references, mappings, and evaluator rules in this challenge.",
  officeAction:
    "This is a simulated Office Action based only on the frozen challenge record. It is not a USPTO action or a conclusion about actual patentability.",
  competitor:
    "A missing literal mapping in this fictional product model is not a noninfringement opinion. Real analysis requires claim construction, current legal status, prosecution history, related rights, jurisdiction, and facts concerning the actual product.",
  final:
    "The result is limited to the ScopeCraft challenge record and must not be used as a real patentability or noninfringement conclusion.",
});

const DIFFICULTY_MODES = Object.freeze({
  guided: {
    id: "guided",
    label: "Guided",
    description:
      "Formatting help, disclosure prompts, visible core references, target embodiments, and one substantive hint.",
    claimBudget: { independent: 1, dependent: 5, total: 6 },
    prosecutionBudget: { amendmentOrArgumentRounds: 1 },
    referenceSchedule: "visible-at-drafting",
    visibleReferenceIdsAtDrafting: ["ref-a", "ref-b", "ref-c", "ref-d"],
    visibleReferenceIdsAfterSubmission: ["ref-a", "ref-b", "ref-c", "ref-d"],
    revealTargetEmbodiments: true,
    showDisclosureTermPrompts: true,
    showMechanicalHelp: true,
    substantiveHintBudget: 1,
    includeExpertRecord: false,
  },
  practitioner: {
    id: "practitioner",
    label: "Practitioner",
    description:
      "Mechanical drafting help, visible core references, a six-claim budget, and one amendment or argument round.",
    claimBudget: { independent: 1, dependent: 5, total: 6 },
    prosecutionBudget: { amendmentOrArgumentRounds: 1 },
    referenceSchedule: "visible-at-drafting",
    visibleReferenceIdsAtDrafting: ["ref-a", "ref-b", "ref-c", "ref-d"],
    visibleReferenceIdsAfterSubmission: ["ref-a", "ref-b", "ref-c", "ref-d"],
    revealTargetEmbodiments: false,
    showDisclosureTermPrompts: false,
    showMechanicalHelp: true,
    substantiveHintBudget: 0,
    includeExpertRecord: false,
  },
  examiner: {
    id: "examiner",
    label: "Examiner",
    description:
      "Prior art and target embodiments are concealed during drafting, the expert record applies, and no substantive hints are available.",
    claimBudget: { independent: 1, dependent: 3, total: 4 },
    prosecutionBudget: { amendmentOrArgumentRounds: 1 },
    referenceSchedule: "reveal-after-initial-submission",
    visibleReferenceIdsAtDrafting: [],
    visibleReferenceIdsAfterSubmission: [
      "ref-a",
      "ref-b",
      "ref-c",
      "ref-d",
      "ref-e",
    ],
    revealTargetEmbodiments: false,
    showDisclosureTermPrompts: false,
    showMechanicalHelp: true,
    substantiveHintBudget: 0,
    includeExpertRecord: true,
  },
});

const DISCLOSURE_ANCHORS = Object.freeze([
  {
    id: "support-problem-fixed-response",
    sectionId: "technical-problem",
    label: "Fixed response problem",
    text:
      "A fixed pressure-to-scroll relationship can feel too aggressive for one user and too slow for another.",
    conceptIds: ["pressure-to-scroll-mapping", "scrolling-amount"],
  },
  {
    id: "support-problem-changing-use",
    sectionId: "technical-problem",
    label: "Changing user behavior",
    text:
      "A pressure-to-scroll relationship may become less suitable as a user's grip or fatigue changes, and manual settings may not identify pressure ranges associated with overshooting.",
    conceptIds: ["pressure-interval", "correction-sequence"],
  },
  {
    id: "support-record-fields",
    sectionId: "disclosed-improvement",
    label: "Pressure-associated correction record",
    text:
      "Each selected scrolling interaction may be stored as a record containing a pressure value, the direction and amount of a scrolling command, and a correction label indicating whether an opposite-direction input occurred within a correction interval.",
    conceptIds: [
      "interaction-record",
      "pressure-value",
      "scrolling-command",
      "correction-label",
      "correction-interval",
      "correction-sequence",
    ],
  },
  {
    id: "support-interval-statistics",
    sectionId: "disclosed-improvement",
    label: "Interval-specific correction statistics",
    text:
      "Records are grouped into pressure intervals, and a correction measure is derived for each interval from the records assigned to that interval.",
    conceptIds: [
      "interaction-record",
      "pressure-interval",
      "correction-measure",
      "correction-label",
    ],
  },
  {
    id: "support-selective-update",
    sectionId: "disclosed-improvement",
    label: "Localized mapping update",
    text:
      "When a correction measure satisfies an update threshold, the system changes the scroll gain for the implicated pressure interval while retaining the gain assigned to one or more other pressure intervals.",
    conceptIds: [
      "correction-measure",
      "update-threshold",
      "mapping-value",
      "pressure-interval",
      "selective-interval-update",
    ],
  },
  {
    id: "support-runtime-use",
    sectionId: "disclosed-improvement",
    label: "Later operation",
    text:
      "During later operation, the system locates the pressure interval containing a current pressure value, applies the gain associated with that interval, and produces a scrolling command.",
    conceptIds: [
      "pressure-value",
      "pressure-interval",
      "mapping-value",
      "scrolling-command",
      "scrolling-amount",
    ],
  },
  {
    id: "support-input-structures",
    sectionId: "supported-alternatives",
    label: "Pressure-responsive structures",
    text:
      "The pressure-responsive element may be a depressible button, pressure-sensitive strip, squeeze region, or pressure-responsive scroll wheel.",
    conceptIds: ["pressure-responsive-element"],
  },
  {
    id: "support-sensors",
    sectionId: "supported-alternatives",
    label: "Sensor technologies",
    text:
      "Pressure may be detected with a force-sensing resistor, capacitive sensor, piezoelectric sensor, strain gauge, or another sensor producing a value representative of applied force.",
    conceptIds: ["pressure-sensor", "pressure-value"],
  },
  {
    id: "support-processing-location",
    sectionId: "supported-alternatives",
    label: "Processing locations",
    text:
      "Processing may occur in the pointing device, the host, or a controller distributed between them.",
    conceptIds: ["processor", "distributed-controller"],
  },
  {
    id: "support-correction-window",
    sectionId: "supported-alternatives",
    label: "Correction interval range",
    text: "A correction interval may be between 100 and 750 milliseconds.",
    conceptIds: ["correction-interval"],
  },
  {
    id: "support-rolling-window",
    sectionId: "supported-alternatives",
    label: "History window",
    text: "The history may be a rolling window of the most recent 20 to 500 records.",
    conceptIds: ["rolling-window", "interaction-record"],
  },
  {
    id: "support-minimum-records",
    sectionId: "supported-alternatives",
    label: "Minimum records",
    text: "An update may require at least 5 records in a pressure interval.",
    conceptIds: ["minimum-record-count", "pressure-interval"],
  },
  {
    id: "support-transfer-function",
    sectionId: "supported-alternatives",
    label: "Transfer-function shape",
    text: "The transfer function may be piecewise linear and constrained to remain monotonic.",
    conceptIds: ["pressure-to-scroll-mapping", "piecewise-linear", "monotonic"],
  },
  {
    id: "support-profiles",
    sectionId: "supported-alternatives",
    label: "User and application profiles",
    text: "Separate functions may be stored for different users or applications.",
    conceptIds: ["profile-specific-mapping", "pressure-to-scroll-mapping"],
  },
  {
    id: "support-outliers",
    sectionId: "supported-alternatives",
    label: "Outlier exclusion",
    text: "Outlier records may be excluded based on pressure, timing, or scroll amount.",
    conceptIds: ["outlier-record", "interaction-record"],
  },
  {
    id: "support-other-outputs",
    sectionId: "supported-alternatives",
    label: "Other continuous outputs",
    text:
      "The learning technique may control cursor displacement, zooming, timeline navigation, or another continuous navigation output, although scrolling is the primary embodiment.",
    conceptIds: ["continuous-navigation-output"],
  },
  {
    id: "support-commercial-breadth",
    sectionId: "commercial-objective",
    label: "Commercial breadth",
    text:
      "The desired claim should cover different pressure sensors and controller placements without requiring a rotatable wheel, force-sensing resistor, processing inside the mouse, or a particular application.",
    conceptIds: [
      "pressure-responsive-element",
      "pressure-sensor",
      "processor",
      "distributed-controller",
    ],
  },
]);

const SUPPORTED_ALTERNATIVES = Object.freeze([
  {
    id: "alternative-input-structure",
    category: "pressure-responsive element",
    values: [
      "depressible button",
      "pressure-sensitive strip",
      "squeeze region",
      "pressure-responsive scroll wheel",
    ],
    supportAnchorId: "support-input-structures",
  },
  {
    id: "alternative-pressure-sensor",
    category: "pressure sensor",
    values: [
      "force-sensing resistor",
      "capacitive sensor",
      "piezoelectric sensor",
      "strain gauge",
      "another sensor producing a value representative of applied force",
    ],
    supportAnchorId: "support-sensors",
  },
  {
    id: "alternative-processing-location",
    category: "processing location",
    values: ["pointing device", "host", "distributed between pointing device and host"],
    supportAnchorId: "support-processing-location",
  },
  {
    id: "alternative-correction-interval",
    category: "correction interval",
    values: ["100 to 750 milliseconds"],
    supportAnchorId: "support-correction-window",
  },
  {
    id: "alternative-history-window",
    category: "history",
    values: ["rolling window of the most recent 20 to 500 records"],
    supportAnchorId: "support-rolling-window",
  },
  {
    id: "alternative-minimum-sample",
    category: "minimum sample",
    values: ["at least 5 records in a pressure interval"],
    supportAnchorId: "support-minimum-records",
  },
  {
    id: "alternative-transfer-function",
    category: "transfer function",
    values: ["piecewise linear", "constrained to remain monotonic"],
    supportAnchorId: "support-transfer-function",
  },
  {
    id: "alternative-profile",
    category: "stored function profile",
    values: ["different users", "different applications"],
    supportAnchorId: "support-profiles",
  },
  {
    id: "alternative-outlier",
    category: "outlier exclusion basis",
    values: ["pressure", "timing", "scroll amount"],
    supportAnchorId: "support-outliers",
  },
  {
    id: "alternative-output",
    category: "continuous navigation output",
    values: ["scrolling", "cursor displacement", "zooming", "timeline navigation"],
    supportAnchorId: "support-other-outputs",
  },
]);

const PLAYER_DISCLOSURE = Object.freeze({
  title: "Pressure-History Adaptive Mouse",
  familiarObject: "computer mouse",
  fictionalImprovement: true,
  sections: [
    {
      id: "technical-problem",
      title: "Technical problem",
      body:
        "A fixed pressure-to-scroll relationship can feel too aggressive for one user and too slow for another. It may also become less suitable as a user's grip or fatigue changes. Existing manual sensitivity settings require deliberate calibration and may not identify the pressure ranges associated with overshooting a target location.",
      anchorIds: ["support-problem-fixed-response", "support-problem-changing-use"],
    },
    {
      id: "disclosed-improvement",
      title: "Disclosed improvement",
      body:
        "The system learns a user-specific pressure-to-scroll transfer function from ordinary scrolling. It associates pressure values with later correction labels, derives correction measures for pressure intervals, selectively updates an implicated interval, and uses the resulting mapping during later operation.",
      anchorIds: [
        "support-record-fields",
        "support-interval-statistics",
        "support-selective-update",
        "support-runtime-use",
      ],
    },
    {
      id: "supported-alternatives",
      title: "Expressly disclosed alternatives",
      body:
        "The packet expressly supports the structures, sensors, processing locations, timing ranges, sample rules, function forms, profiles, outlier handling, and continuous outputs listed below.",
      anchorIds: [
        "support-input-structures",
        "support-sensors",
        "support-processing-location",
        "support-correction-window",
        "support-rolling-window",
        "support-minimum-records",
        "support-transfer-function",
        "support-profiles",
        "support-outliers",
        "support-other-outputs",
      ],
    },
    {
      id: "commercial-objective",
      title: "Commercial objective",
      body:
        "Cover mice having different pressure-sensor technologies and different placements of the learning controller. Avoid limiting the independent claim to a rotatable wheel, a force-sensing resistor, processing inside the mouse, or a particular application.",
      anchorIds: ["support-commercial-breadth"],
    },
    {
      id: "claim-task",
      title: "Claim task",
      body:
        "Draft the broadest supported independent system or apparatus claim you believe can survive the supplied record, then create a meaningful fallback ladder. Refine nouns and relationships already introduced in the parent claim before adding incidental hardware.",
      anchorIds: [],
    },
  ],
  anchors: DISCLOSURE_ANCHORS,
  supportedAlternatives: SUPPORTED_ALTERNATIVES,
});

function makeReference({
  id,
  label,
  publicationNumber,
  title,
  publicationDate,
  sourceUrl,
  role,
  summary,
  strengths,
  gaps,
  pinpoints,
  hashInput,
  contentHash,
}) {
  return {
    id,
    label,
    publicationNumber,
    title,
    publicationDate,
    sourceUrl,
    documentType: "published patent document",
    role,
    summary,
    strengths,
    gaps,
    pinpoints,
    frozenEvidenceManifest: {
      snapshotId: `${id}-curated-evidence-v1`,
      retrievalDate: "2026-08-24",
      snapshotScope:
        "ScopeCraft-curated pinpoint manifest and paraphrased teaching summaries; no full patent text or PDF is embedded.",
      hashAlgorithm: "SHA-256",
      hashInput,
      contentHash,
    },
    statusNotice:
      "Used for its disclosure in this exercise. This card does not state current enforceability, ownership, term, or legal status.",
  };
}

const CORE_REFERENCES = Object.freeze([
  makeReference({
    id: "ref-a",
    label: "Reference A",
    publicationNumber: "US20030107547A1",
    title: "Pointing device with force sensitive resistor",
    publicationDate: "2003-06-12",
    sourceUrl: "https://patents.google.com/patent/US20030107547A1/en",
    role: "pressure-responsive scrolling hardware and present-pressure response",
    summary:
      "A mouse can use a pressure-sensitive scrolling control, and current pressure can control continuous scrolling speed.",
    strengths: [
      "pressure-responsive mouse input",
      "pressure-dependent scrolling speed",
      "mouse communication and scrolling control",
    ],
    gaps: [
      "no learning from historical correction events located in the cited pinpoints",
      "no per-pressure-interval correction statistics located in the cited pinpoints",
    ],
    pinpoints: [
      {
        id: "ref-a-claims-2-5",
        locator: "claims 2 and 5",
        excerptType: "ScopeCraft paraphrase",
        excerpt: "A mouse scrolling control uses sensed pressure to determine scrolling speed.",
        conceptIds: [
          "pressure-responsive-element",
          "pressure-value",
          "scrolling-command",
          "scrolling-amount",
        ],
      },
      {
        id: "ref-a-claims-11-17",
        locator: "claims 11, 16, and 17",
        excerptType: "ScopeCraft paraphrase",
        excerpt:
          "A short activation is distinguished from continuous pressure-dependent movement, with scrolling expressly recited.",
        conceptIds: ["pressure-value", "scrolling-command", "scrolling-amount"],
      },
      {
        id: "ref-a-paragraphs",
        locator: "paragraphs [0013], [0029], and [0034]",
        excerptType: "ScopeCraft paraphrase",
        excerpt:
          "Pressure-sensitive mouse structures provide pressure-responsive scrolling control.",
        conceptIds: ["pressure-responsive-element", "pressure-sensor"],
      },
    ],
    hashInput:
      "US20030107547A1|2026-08-24|claims 2,5,11,16,17|paragraphs 13,29,34",
    contentHash: "a2ed0b351e9cf52224987574f2c36c2757cbad15a4a13ed76520ba0cf678214b",
  }),
  makeReference({
    id: "ref-b",
    label: "Reference B",
    publicationNumber: "US20080082939A1",
    title: "Scrolling behavior-influenced algorithm selection to facilitate adaptive scrolling",
    publicationDate: "2008-04-03",
    sourceUrl: "https://patents.google.com/patent/US20080082939A1/en",
    role: "correction-sequence learning and adaptive scroll behavior",
    summary:
      "A scrolling agent may tune or select a scrolling algorithm from learned behavior, including a rapid scroll followed by a short opposite-direction correction.",
    strengths: [
      "historical adaptation",
      "opposite-direction correction sequence as feedback",
      "learning-based tuning of speed or sensitivity",
    ],
    gaps: [
      "no measured pressure input located in the cited pinpoints",
      "no correction statistics separated by pressure interval located in the cited pinpoints",
      "no stored per-event pressure-and-correction record located in the cited pinpoints",
    ],
    pinpoints: [
      {
        id: "ref-b-claims-1-4-7",
        locator: "claims 1, 4, and 7",
        excerptType: "ScopeCraft paraphrase",
        excerpt:
          "Input factors and learned behavior are used to select or tune scrolling speed and sensitivity.",
        conceptIds: ["scrolling-command", "scrolling-amount", "historical-adaptation"],
      },
      {
        id: "ref-b-paragraph-29",
        locator: "paragraph [0029]",
        excerptType: "ScopeCraft paraphrase",
        excerpt:
          "A short reverse correction following rapid scrolling can indicate that acceleration was excessive.",
        conceptIds: ["correction-sequence", "correction-interval"],
      },
      {
        id: "ref-b-paragraph-34",
        locator: "paragraph [0034]",
        excerptType: "ScopeCraft paraphrase",
        excerpt: "Observed scrolling behavior can tune a later scrolling algorithm.",
        conceptIds: ["historical-adaptation", "pressure-to-scroll-mapping"],
      },
    ],
    hashInput: "US20080082939A1|2026-08-24|claims 1,4,7|paragraphs 29,34",
    contentHash: "11a4020265f02d5baf642274bca884e0f34b32f170a33cf718181a0b509b41ab",
  }),
  makeReference({
    id: "ref-c",
    label: "Reference C",
    publicationNumber: "US20040119682A1",
    title: "Self-correcting autonomic mouse",
    publicationDate: "2004-06-24",
    sourceUrl: "https://patents.google.com/patent/US20040119682A1/en",
    role: "stored adaptation parameters and user or application profiles",
    summary:
      "Mouse input can be monitored and modified from patterns indicating user difficulty, with compensation parameters stored by user or application.",
    strengths: [
      "historical input-pattern adaptation",
      "stored user-specific parameters",
      "stored application-specific parameters",
    ],
    gaps: [
      "no pressure sensing located in the cited pinpoints",
      "no pressure-to-scroll intervals located in the cited pinpoints",
    ],
    pinpoints: [
      {
        id: "ref-c-claims-11-16",
        locator: "claims 11 through 16",
        excerptType: "ScopeCraft paraphrase",
        excerpt:
          "Pointing-device resolution may be altered from input patterns using user-specific or application-specific parameters.",
        conceptIds: ["historical-adaptation", "profile-specific-mapping"],
      },
      {
        id: "ref-c-paragraphs-8-14",
        locator: "paragraphs [0008] and [0012] through [0014]",
        excerptType: "ScopeCraft paraphrase",
        excerpt:
          "Patterns suggesting user difficulty can trigger automatic mouse compensation.",
        conceptIds: ["historical-adaptation"],
      },
      {
        id: "ref-c-paragraph-46",
        locator: "paragraph [0046]",
        excerptType: "ScopeCraft paraphrase",
        excerpt: "Generated compensation may be retained for a user or application context.",
        conceptIds: ["profile-specific-mapping"],
      },
    ],
    hashInput: "US20040119682A1|2026-08-24|claims 11-16|paragraphs 8,12-14,46",
    contentHash: "16da6c2366a990033536ccfa2e9c5ff9d10880d2c10ea6fbc6762db689f4058a",
  }),
  makeReference({
    id: "ref-d",
    label: "Reference D",
    publicationNumber: "US20230168751A1",
    title: "Configuring a mouse device through pressure detection",
    publicationDate: "2023-06-01",
    sourceUrl: "https://patents.google.com/patent/US20230168751A1/en",
    role: "pressure ranges, personalized calibration, and editable response-curve parameters",
    summary:
      "Mouse states and sensitivity may correspond to pressure ranges, user or application context, calibration samples, and editable response-curve parameters.",
    strengths: [
      "predetermined pressure ranges",
      "pressure-dependent sensitivity states",
      "personalized or application-sensitive calibration",
      "modification of selected curve points or parameters",
    ],
    gaps: [
      "no later reverse-scroll event used as a label for an earlier pressure sample located in the cited pinpoints",
      "no per-range correction measure derived from correction labels located in the cited pinpoints",
    ],
    pinpoints: [
      {
        id: "ref-d-claim-9",
        locator: "claim 9",
        excerptType: "ScopeCraft paraphrase",
        excerpt: "A detected pressure range selects an associated mouse sensitivity state.",
        conceptIds: ["pressure-value", "pressure-interval", "mapping-value"],
      },
      {
        id: "ref-d-claim-11",
        locator: "claim 11",
        excerptType: "ScopeCraft paraphrase",
        excerpt:
          "State-change criteria may depend on applications, device attributes, user settings, or usage habits.",
        conceptIds: ["profile-specific-mapping", "historical-adaptation"],
      },
      {
        id: "ref-d-calibration",
        locator: "paragraphs [0036], [0084] through [0091], and [0117] through [0128]",
        excerptType: "ScopeCraft paraphrase",
        excerpt:
          "Guided calibration uses measured pressure samples to establish sensitivity settings.",
        conceptIds: ["pressure-value", "pressure-interval", "pressure-to-scroll-mapping"],
      },
      {
        id: "ref-d-curve-editing",
        locator: "paragraphs [0139] through [0141]",
        excerptType: "ScopeCraft paraphrase",
        excerpt: "Selected curve points or individual curve parameters may be modified.",
        conceptIds: ["mapping-value", "selective-interval-update"],
      },
    ],
    hashInput:
      "US20230168751A1|2026-08-24|claims 9,11|paragraphs 36,84-91,117-128,139-141",
    contentHash: "e613c76ac60663e7bc11a6243cddfa0ea8c8fac995fda48fc6c65bb88374aa9b",
  }),
]);

const EXPERT_REFERENCE = Object.freeze(
  makeReference({
    id: "ref-e",
    label: "Expert Reference",
    publicationNumber: "US20070024595A1",
    title:
      "System and method for implementing a control function via a sensor having a touch sensitive control input surface",
    publicationDate: "2007-02-01",
    sourceUrl: "https://patents.google.com/patent/US20070024595A1/en",
    role: "hard-mode pressure ranges, direction changes, and pressure-to-output modification",
    summary:
      "The cited portions discuss direction changes, discrete pressure ranges mapped to scrolling speeds, and modification of a pressure-to-output relationship in response to a stimulus.",
    strengths: [
      "discrete pressure ranges",
      "range-specific scrolling speeds",
      "direction changes",
      "modification of pressure-to-output behavior in response to a stimulus",
    ],
    gaps: [
      "the fixed card does not expressly identify the claimed stored pressure-and-correction labels",
      "the fixed card does not expressly calculate correction measures from labels for respective pressure intervals",
    ],
    pinpoints: [
      {
        id: "ref-e-paragraph-70",
        locator: "paragraph [0070]",
        excerptType: "ScopeCraft paraphrase",
        excerpt: "The control discussion includes changes in an input direction.",
        conceptIds: ["correction-sequence"],
      },
      {
        id: "ref-e-paragraphs-74-77",
        locator: "paragraphs [0074] through [0077]",
        excerptType: "ScopeCraft paraphrase",
        excerpt:
          "Discrete pressure ranges map to scrolling speeds, and a stimulus may modify the pressure-to-output relationship.",
        conceptIds: [
          "pressure-interval",
          "scrolling-amount",
          "mapping-value",
          "selective-interval-update",
        ],
      },
    ],
    hashInput: "US20070024595A1|2026-08-24|paragraphs 70,74-77",
    contentHash: "692a77c1d70b8d834d24c08b166a6805175418efd20a33a57e7ab2b7fc62a285",
  }),
);

const CONCEPTS = Object.freeze([
  {
    id: "computer-input-system",
    label: "computer input system",
    kind: "apparatus",
    synonyms: ["input system", "pointing-device system", "mouse system"],
    caution:
      "A mouse is a disclosed commercial embodiment, but the supported system wording need not require mouse-specific housing structure.",
  },
  {
    id: "pressure-responsive-element",
    label: "pressure-responsive scrolling element",
    kind: "component",
    synonyms: [
      "pressure-sensitive scrolling element",
      "force-responsive input element",
      "pressure-responsive input structure",
    ],
    caution: "Do not treat every touch input as pressure responsive without a pressure value.",
  },
  {
    id: "pressure-sensor",
    label: "pressure sensor",
    kind: "component",
    synonyms: ["force sensor", "pressure detector"],
  },
  {
    id: "pressure-value",
    label: "pressure value",
    kind: "data",
    synonyms: ["force value", "value representative of applied force", "pressure sample"],
  },
  {
    id: "interface",
    label: "interface",
    kind: "component",
    synonyms: ["communication interface", "host interface"],
  },
  {
    id: "processor",
    label: "one or more processors",
    kind: "component",
    synonyms: ["processing circuitry", "controller", "processing structure"],
    caution:
      "Controller wording must remain broad enough to cover processing in the device, host, or distributed between them when that breadth is intended.",
  },
  {
    id: "distributed-controller",
    label: "distributed controller",
    kind: "architecture",
    synonyms: ["distributed processing", "device-and-host processing"],
  },
  {
    id: "pressure-to-scroll-mapping",
    label: "pressure-to-scroll mapping",
    kind: "data-structure",
    synonyms: ["pressure-to-scroll transfer function", "pressure-response curve", "scroll-gain mapping"],
    caution:
      "A generic mapping does not necessarily require separate pressure intervals or localized updates.",
  },
  {
    id: "mapping-value",
    label: "mapping value",
    kind: "data",
    synonyms: ["scroll gain", "curve parameter", "transfer-function value"],
  },
  {
    id: "scrolling-command",
    label: "scrolling command",
    kind: "signal",
    synonyms: ["scroll command", "scrolling output"],
  },
  {
    id: "scrolling-amount",
    label: "scrolling amount",
    kind: "data",
    synonyms: ["scroll distance", "scroll speed", "scrolling magnitude"],
    caution:
      "Speed, distance, and magnitude can describe different implementations; treat them as related only where the claim language and packet support permit.",
  },
  {
    id: "correction-sequence",
    label: "correction sequence",
    kind: "event-relation",
    synonyms: ["reverse-scroll correction", "opposite-direction correction sequence"],
  },
  {
    id: "correction-interval",
    label: "correction interval",
    kind: "time",
    synonyms: ["correction window", "reverse-input interval"],
  },
  {
    id: "interaction-record",
    label: "interaction record",
    kind: "data-structure",
    synonyms: ["scroll record", "history record", "training record"],
  },
  {
    id: "correction-label",
    label: "correction label",
    kind: "data",
    synonyms: ["reverse-correction indicator", "correction outcome label"],
  },
  {
    id: "pressure-interval",
    label: "pressure interval",
    kind: "data-domain",
    synonyms: ["pressure range", "force interval", "pressure bin"],
  },
  {
    id: "correction-measure",
    label: "correction measure",
    kind: "data",
    synonyms: ["correction rate", "correction statistic", "reverse-scroll measure"],
  },
  {
    id: "update-threshold",
    label: "update threshold",
    kind: "control-parameter",
    synonyms: ["correction threshold", "adjustment threshold"],
  },
  {
    id: "selective-interval-update",
    label: "selective interval update",
    kind: "operation-relation",
    synonyms: ["localized mapping update", "range-specific adjustment"],
  },
  {
    id: "historical-adaptation",
    label: "historical adaptation",
    kind: "operation",
    synonyms: ["learned adjustment", "behavior-based tuning"],
  },
  {
    id: "minimum-record-count",
    label: "minimum record count",
    kind: "control-parameter",
    synonyms: ["minimum sample count", "sample threshold"],
  },
  {
    id: "rolling-window",
    label: "rolling window",
    kind: "data-structure",
    synonyms: ["moving history window", "recent-record window"],
  },
  {
    id: "outlier-record",
    label: "outlier record",
    kind: "data",
    synonyms: ["excluded sample", "anomalous record"],
  },
  {
    id: "piecewise-linear",
    label: "piecewise-linear transfer function",
    kind: "mathematical-property",
    synonyms: ["piecewise linear mapping"],
  },
  {
    id: "monotonic",
    label: "monotonic transfer function",
    kind: "mathematical-property",
    synonyms: ["monotone mapping"],
  },
  {
    id: "profile-specific-mapping",
    label: "profile-specific mapping",
    kind: "data-relationship",
    synonyms: ["per-application mapping", "per-user mapping"],
  },
  {
    id: "continuous-navigation-output",
    label: "continuous navigation output",
    kind: "output-category",
    synonyms: ["continuous navigation command", "continuous interface movement"],
  },
]);

const CONCEPT_RELATIONS = Object.freeze([
  {
    id: "relation-element-generates-pressure",
    subjectId: "pressure-responsive-element",
    predicate: "generates",
    objectId: "pressure-value",
    supportAnchorIds: ["support-record-fields", "support-runtime-use"],
  },
  {
    id: "relation-record-associates-pressure",
    subjectId: "interaction-record",
    predicate: "associates",
    objectId: "pressure-value",
    supportAnchorIds: ["support-record-fields"],
  },
  {
    id: "relation-record-associates-label",
    subjectId: "interaction-record",
    predicate: "associates",
    objectId: "correction-label",
    supportAnchorIds: ["support-record-fields"],
  },
  {
    id: "relation-label-represents-sequence",
    subjectId: "correction-label",
    predicate: "represents-whether-occurred",
    objectId: "correction-sequence",
    supportAnchorIds: ["support-record-fields"],
  },
  {
    id: "relation-record-assigned-interval",
    subjectId: "interaction-record",
    predicate: "assigned-by-pressure-to",
    objectId: "pressure-interval",
    supportAnchorIds: ["support-interval-statistics"],
  },
  {
    id: "relation-measure-derived-labels",
    subjectId: "correction-measure",
    predicate: "derived-for-each-interval-from",
    objectId: "correction-label",
    supportAnchorIds: ["support-interval-statistics"],
  },
  {
    id: "relation-selective-update",
    subjectId: "selective-interval-update",
    predicate: "changes-one-and-retains-another",
    objectId: "mapping-value",
    supportAnchorIds: ["support-selective-update"],
  },
  {
    id: "relation-runtime-mapping",
    subjectId: "pressure-to-scroll-mapping",
    predicate: "maps-current-pressure-to",
    objectId: "scrolling-amount",
    supportAnchorIds: ["support-runtime-use"],
  },
]);

function claim({ id, number, dependsOn = null, text, limitations, introducedTerms = [] }) {
  return {
    id,
    number,
    kind: dependsOn === null ? "independent" : "dependent",
    dependsOn,
    text,
    limitations,
    introducedTerms,
  };
}

const INITIAL_CLAIMS = Object.freeze([
  claim({
    id: "initial-claim-1",
    number: 1,
    text:
      "1. A computer input system comprising:\n    a pressure-responsive scrolling element configured to generate pressure values in response to user inputs;\n    an interface configured to communicate scrolling commands to a host device; and\n    one or more processors configured to:\n        maintain a pressure-to-scroll mapping;\n        determine, using the pressure-to-scroll mapping, respective scrolling amounts for the pressure values;\n        cause the interface to communicate the scrolling commands specifying the respective scrolling amounts; and\n        update the pressure-to-scroll mapping based on a history of the scrolling commands.",
    introducedTerms: [
      "computer input system",
      "pressure-responsive scrolling element",
      "pressure values",
      "user inputs",
      "interface",
      "scrolling commands",
      "host device",
      "one or more processors",
      "pressure-to-scroll mapping",
      "scrolling amounts",
      "history",
    ],
    limitations: [
      {
        id: "i1-preamble",
        text: "a computer input system",
        conceptIds: ["computer-input-system"],
        supportAnchorIds: ["support-commercial-breadth"],
      },
      {
        id: "i1-pressure-element",
        text:
          "a pressure-responsive scrolling element configured to generate pressure values in response to user inputs",
        conceptIds: ["pressure-responsive-element", "pressure-value"],
        supportAnchorIds: ["support-record-fields", "support-input-structures"],
      },
      {
        id: "i1-interface",
        text: "an interface configured to communicate scrolling commands to a host device",
        conceptIds: ["interface", "scrolling-command"],
        supportAnchorIds: ["support-runtime-use"],
      },
      {
        id: "i1-processors",
        text: "one or more processors",
        conceptIds: ["processor", "distributed-controller"],
        supportAnchorIds: ["support-processing-location"],
      },
      {
        id: "i1-maintain-mapping",
        text: "maintain a pressure-to-scroll mapping",
        conceptIds: ["pressure-to-scroll-mapping"],
        supportAnchorIds: ["support-runtime-use"],
      },
      {
        id: "i1-determine-amount",
        text:
          "determine, using the pressure-to-scroll mapping, respective scrolling amounts for the pressure values",
        conceptIds: [
          "pressure-to-scroll-mapping",
          "scrolling-amount",
          "pressure-value",
        ],
        supportAnchorIds: ["support-runtime-use"],
      },
      {
        id: "i1-communicate",
        text:
          "cause the interface to communicate the scrolling commands specifying the respective scrolling amounts",
        conceptIds: ["interface", "scrolling-command", "scrolling-amount"],
        supportAnchorIds: ["support-runtime-use"],
      },
      {
        id: "i1-history-update",
        text: "update the pressure-to-scroll mapping based on a history of the scrolling commands",
        conceptIds: ["historical-adaptation", "pressure-to-scroll-mapping"],
        supportAnchorIds: ["support-record-fields", "support-selective-update"],
      },
    ],
  }),
  claim({
    id: "initial-claim-2",
    number: 2,
    dependsOn: 1,
    text:
      "2. The computer input system of claim 1, wherein the one or more processors are configured to update the pressure-to-scroll mapping in response to detecting a correction sequence comprising a first scrolling command in a first direction followed, within a correction interval, by a second scrolling command in a second direction opposite the first direction.",
    introducedTerms: [
      "correction sequence",
      "first scrolling command",
      "first direction",
      "correction interval",
      "second scrolling command",
      "second direction",
    ],
    limitations: [
      {
        id: "i2-correction-sequence",
        text:
          "update the mapping in response to a first-direction scrolling command followed within a correction interval by a second scrolling command in an opposite direction",
        conceptIds: ["correction-sequence", "correction-interval"],
        supportAnchorIds: ["support-record-fields", "support-correction-window"],
      },
    ],
  }),
  claim({
    id: "initial-claim-3",
    number: 3,
    dependsOn: 2,
    text:
      "3. The computer input system of claim 2, wherein the history comprises records that each associate (i) a respective pressure value used to produce a respective first scrolling command and (ii) a respective correction label indicating whether the respective first scrolling command was followed, within the correction interval, by a scrolling command in an opposite direction, and wherein the one or more processors are configured to:\n    assign the records to pressure intervals based on the respective pressure values;\n    determine respective correction measures for the pressure intervals from the respective correction labels; and\n    update a mapping value for a first pressure interval based on the correction measure for the first pressure interval.",
    introducedTerms: [
      "records",
      "respective pressure value",
      "respective correction label",
      "pressure intervals",
      "respective correction measures",
      "mapping value",
      "first pressure interval",
    ],
    limitations: [
      {
        id: "i3-labeled-record",
        text:
          "records each associate a pressure value used for a first scrolling command with a correction label indicating whether an opposite-direction command followed within the correction interval",
        conceptIds: [
          "interaction-record",
          "pressure-value",
          "correction-label",
          "correction-sequence",
        ],
        supportAnchorIds: ["support-record-fields"],
      },
      {
        id: "i3-assign-intervals",
        text: "assign the records to pressure intervals based on the respective pressure values",
        conceptIds: ["interaction-record", "pressure-interval", "pressure-value"],
        supportAnchorIds: ["support-interval-statistics"],
      },
      {
        id: "i3-correction-measures",
        text:
          "determine respective correction measures for the pressure intervals from the respective correction labels",
        conceptIds: ["correction-measure", "pressure-interval", "correction-label"],
        supportAnchorIds: ["support-interval-statistics"],
      },
      {
        id: "i3-update-first-interval",
        text:
          "update a mapping value for a first pressure interval based on the correction measure for the first pressure interval",
        conceptIds: ["mapping-value", "pressure-interval", "correction-measure"],
        supportAnchorIds: ["support-selective-update"],
      },
    ],
  }),
  claim({
    id: "initial-claim-4",
    number: 4,
    dependsOn: 3,
    text:
      "4. The computer input system of claim 3, wherein the one or more processors are configured to update the mapping value for the first pressure interval while retaining a mapping value for a second pressure interval.",
    introducedTerms: ["second pressure interval"],
    limitations: [
      {
        id: "i4-selective-update",
        text:
          "update the first interval's mapping value while retaining a mapping value for a second pressure interval",
        conceptIds: ["selective-interval-update", "mapping-value", "pressure-interval"],
        supportAnchorIds: ["support-selective-update"],
      },
    ],
  }),
  claim({
    id: "initial-claim-5",
    number: 5,
    dependsOn: 1,
    text:
      "5. The computer input system of claim 1, wherein the one or more processors maintain different pressure-to-scroll mappings for different applications executing on the host device.",
    introducedTerms: ["different applications"],
    limitations: [
      {
        id: "i5-application-profiles",
        text: "maintain different pressure-to-scroll mappings for different applications",
        conceptIds: ["profile-specific-mapping", "pressure-to-scroll-mapping"],
        supportAnchorIds: ["support-profiles"],
      },
    ],
  }),
  claim({
    id: "initial-claim-6",
    number: 6,
    dependsOn: 1,
    text:
      "6. The computer input system of claim 1, wherein the pressure-responsive scrolling element comprises a force-sensing resistor.",
    introducedTerms: ["force-sensing resistor"],
    limitations: [
      {
        id: "i6-fsr",
        text: "the pressure-responsive scrolling element comprises a force-sensing resistor",
        conceptIds: ["pressure-responsive-element", "pressure-sensor"],
        supportAnchorIds: ["support-sensors"],
      },
    ],
  }),
]);

const AMENDED_CLAIMS = Object.freeze([
  claim({
    id: "amended-claim-1",
    number: 1,
    text:
      "1. A computer input system comprising:\n    a pressure-responsive scrolling element configured to generate pressure values in response to user inputs;\n    an interface configured to communicate scrolling commands to a host device; and\n    one or more processors configured to:\n        maintain a pressure-to-scroll mapping comprising mapping values associated with respective pressure intervals;\n        store records that each associate (i) a respective pressure value used to produce a respective first scrolling command and (ii) a respective correction label indicating whether a respective second scrolling command in an opposite direction occurred within a correction interval after the respective first scrolling command;\n        assign the records to the pressure intervals based on the respective pressure values;\n        determine respective correction measures for the pressure intervals from the respective correction labels;\n        update a first mapping value associated with a first pressure interval based on the correction measure determined for the first pressure interval while retaining a second mapping value associated with a second pressure interval;\n        receive a current pressure value from the pressure-responsive scrolling element;\n        identify, from the respective pressure intervals, a selected pressure interval containing the current pressure value;\n        determine a scrolling amount using the mapping value associated with the selected pressure interval; and\n        cause the interface to communicate a scrolling command specifying the scrolling amount.",
    introducedTerms: [
      "computer input system",
      "pressure-responsive scrolling element",
      "pressure values",
      "user inputs",
      "interface",
      "scrolling commands",
      "host device",
      "one or more processors",
      "pressure-to-scroll mapping",
      "mapping values",
      "respective pressure intervals",
      "records",
      "respective first scrolling command",
      "respective correction label",
      "respective second scrolling command",
      "opposite direction",
      "correction interval",
      "respective correction measures",
      "first mapping value",
      "first pressure interval",
      "second mapping value",
      "second pressure interval",
      "current pressure value",
      "selected pressure interval",
      "scrolling amount",
    ],
    limitations: [
      {
        id: "a1-preamble",
        text: "a computer input system",
        conceptIds: ["computer-input-system"],
        supportAnchorIds: ["support-commercial-breadth"],
      },
      {
        id: "a1-pressure-element",
        text:
          "a pressure-responsive scrolling element configured to generate pressure values in response to user inputs",
        conceptIds: ["pressure-responsive-element", "pressure-value"],
        supportAnchorIds: ["support-record-fields", "support-input-structures"],
      },
      {
        id: "a1-interface",
        text: "an interface configured to communicate scrolling commands to a host device",
        conceptIds: ["interface", "scrolling-command"],
        supportAnchorIds: ["support-runtime-use"],
      },
      {
        id: "a1-processors",
        text: "one or more processors",
        conceptIds: ["processor", "distributed-controller"],
        supportAnchorIds: ["support-processing-location"],
      },
      {
        id: "a1-interval-mapping",
        text:
          "maintain a pressure-to-scroll mapping comprising mapping values associated with respective pressure intervals",
        conceptIds: ["pressure-to-scroll-mapping", "mapping-value", "pressure-interval"],
        supportAnchorIds: ["support-interval-statistics", "support-runtime-use"],
      },
      {
        id: "a1-labeled-records",
        text:
          "store records associating a pressure value used for a first scrolling command with a correction label indicating whether an opposite-direction command occurred within a correction interval afterward",
        conceptIds: [
          "interaction-record",
          "pressure-value",
          "correction-label",
          "correction-sequence",
          "correction-interval",
        ],
        supportAnchorIds: ["support-record-fields"],
      },
      {
        id: "a1-assign-records",
        text: "assign the records to pressure intervals based on their pressure values",
        conceptIds: ["interaction-record", "pressure-interval", "pressure-value"],
        supportAnchorIds: ["support-interval-statistics"],
      },
      {
        id: "a1-determine-measures",
        text:
          "determine respective correction measures for the pressure intervals from the correction labels",
        conceptIds: ["correction-measure", "pressure-interval", "correction-label"],
        supportAnchorIds: ["support-interval-statistics"],
      },
      {
        id: "a1-selective-update",
        text:
          "update a first interval's mapping value from its correction measure while retaining a second interval's mapping value",
        conceptIds: [
          "selective-interval-update",
          "mapping-value",
          "correction-measure",
          "pressure-interval",
        ],
        supportAnchorIds: ["support-selective-update"],
      },
      {
        id: "a1-receive-current-pressure",
        text: "receive a current pressure value from the pressure-responsive scrolling element",
        conceptIds: ["pressure-value", "pressure-responsive-element"],
        supportAnchorIds: ["support-runtime-use"],
      },
      {
        id: "a1-select-interval",
        text: "identify the selected pressure interval containing the current pressure value",
        conceptIds: ["pressure-interval", "pressure-value"],
        supportAnchorIds: ["support-runtime-use"],
      },
      {
        id: "a1-determine-output",
        text: "determine a scrolling amount using the selected interval's mapping value",
        conceptIds: ["scrolling-amount", "mapping-value", "pressure-interval"],
        supportAnchorIds: ["support-runtime-use"],
      },
      {
        id: "a1-communicate-output",
        text: "cause the interface to communicate a scrolling command specifying the scrolling amount",
        conceptIds: ["interface", "scrolling-command", "scrolling-amount"],
        supportAnchorIds: ["support-runtime-use"],
      },
    ],
  }),
  claim({
    id: "amended-claim-2",
    number: 2,
    dependsOn: 1,
    text:
      "2. The computer input system of claim 1, wherein the one or more processors are configured to reduce the first mapping value when the correction measure determined for the first pressure interval exceeds a correction threshold.",
    introducedTerms: ["correction threshold"],
    limitations: [
      {
        id: "a2-threshold-reduction",
        text:
          "reduce the first mapping value when the first interval's correction measure exceeds a correction threshold",
        conceptIds: ["mapping-value", "correction-measure", "update-threshold"],
        supportAnchorIds: ["support-selective-update"],
      },
    ],
  }),
  claim({
    id: "amended-claim-3",
    number: 3,
    dependsOn: 2,
    text:
      "3. The computer input system of claim 2, wherein the one or more processors are configured to refrain from reducing the first mapping value until at least a minimum number of the records have been assigned to the first pressure interval.",
    introducedTerms: ["minimum number"],
    limitations: [
      {
        id: "a3-minimum-records",
        text:
          "refrain from reducing the first mapping value until a minimum number of records are assigned to the first pressure interval",
        conceptIds: ["minimum-record-count", "interaction-record", "pressure-interval"],
        supportAnchorIds: ["support-minimum-records"],
      },
    ],
  }),
  claim({
    id: "amended-claim-4",
    number: 4,
    dependsOn: 1,
    text:
      "4. The computer input system of claim 1, wherein the pressure-to-scroll mapping comprises a monotonic piecewise-linear transfer function.",
    introducedTerms: ["monotonic piecewise-linear transfer function"],
    limitations: [
      {
        id: "a4-function-shape",
        text: "the mapping comprises a monotonic piecewise-linear transfer function",
        conceptIds: ["pressure-to-scroll-mapping", "piecewise-linear", "monotonic"],
        supportAnchorIds: ["support-transfer-function"],
      },
    ],
  }),
  claim({
    id: "amended-claim-5",
    number: 5,
    dependsOn: 1,
    text:
      "5. The computer input system of claim 1, wherein the records comprise a rolling window of records, and wherein the one or more processors are configured to exclude an outlier record from the rolling window based on at least one of pressure, timing, or scrolling amount.",
    introducedTerms: ["rolling window", "outlier record"],
    limitations: [
      {
        id: "a5-window-outlier",
        text:
          "use a rolling record window and exclude an outlier based on pressure, timing, or scrolling amount",
        conceptIds: ["rolling-window", "outlier-record", "interaction-record"],
        supportAnchorIds: ["support-rolling-window", "support-outliers"],
      },
    ],
  }),
  claim({
    id: "amended-claim-6",
    number: 6,
    dependsOn: 1,
    text:
      "6. The computer input system of claim 1, wherein the one or more processors are configured to maintain different pressure-to-scroll mappings for different applications executing on the host device.",
    introducedTerms: ["different applications"],
    limitations: [
      {
        id: "a6-application-profiles",
        text: "maintain different pressure-to-scroll mappings for different applications",
        conceptIds: ["profile-specific-mapping", "pressure-to-scroll-mapping"],
        supportAnchorIds: ["support-profiles"],
      },
    ],
  }),
]);

const PLAYER_FACING = Object.freeze({
  educationalBoundary: EDUCATIONAL_BOUNDARY,
  disclosure: PLAYER_DISCLOSURE,
  priorArt: {
    instructions:
      "The reference cards summarize selected teachings and link to full publications. Players may inspect each full publication, but the simulator evaluates only the curated, versioned challenge evidence facts and identifies the configured fact used for each finding.",
    statusNotice:
      "Publication use in this exercise does not state current enforceability or legal status. Prior-art availability is stipulated only for game play.",
    sourceFreezePolicy: {
      version: "1.0.0",
      scope:
        "Each card freezes a curated pinpoint manifest and ScopeCraft teaching summary, not the full patent document.",
      requiredFields: [
        "publication number",
        "source URL",
        "retrieval date",
        "pinpoint locator",
        "manifest hash input",
        "SHA-256 manifest hash",
      ],
      fullDocumentPolicy:
        "Link to the public source. Do not download or embed a full patent PDF in the Challenge 01 data bundle.",
      stabilityPolicy:
        "Deterministic findings use the versioned evidence facts and pinpoints in the bundle. Any later evidence revision must increment the content version and regenerate affected manifest hashes.",
    },
    cards: CORE_REFERENCES,
  },
  lexicon: {
    concepts: CONCEPTS,
    relations: CONCEPT_RELATIONS,
  },
  editorScaffold: {
    independent:
      "1. A [supported system or apparatus] comprising:\n    [introduce a supported component];\n    [introduce another supported component]; and\n    [recite supported operations and relationships].",
    dependent:
      "The [system] of claim [number], wherein [further limit an introduced noun or relationship].",
    ghostTextPolicy:
      "Ghost text teaches claim grammar and structure. It must not supply a hidden inventive answer.",
    actionsForSelectedMappingTerm: [
      "Create a dependent claim from the pressure-to-scroll mapping",
      "Show disclosure support for this term",
      "Show where this term is first introduced",
      "List disclosed refinements without ranking likely patentability",
    ],
  },
});

const TARGET_EMBODIMENTS = Object.freeze([
  {
    id: "target-wheel-device-learning",
    label: "Strain-gauged wheel",
    description: "A mouse with a strain-gauged scroll wheel and on-device learning.",
    requiredConceptIds: [
      "pressure-responsive-element",
      "pressure-sensor",
      "processor",
      "pressure-to-scroll-mapping",
    ],
    forbiddenNeedlessLimitations: ["force-sensing resistor", "host-only processing"],
  },
  {
    id: "target-strip-host-learning",
    label: "Capacitive strip",
    description: "A mouse with a capacitive scrolling strip and host-side learning.",
    requiredConceptIds: [
      "pressure-responsive-element",
      "pressure-sensor",
      "processor",
      "pressure-to-scroll-mapping",
    ],
    forbiddenNeedlessLimitations: ["rotatable wheel", "device-only processing"],
  },
  {
    id: "target-button-distributed-learning",
    label: "Distributed pressure button",
    description:
      "A mouse with a pressure-sensitive scroll button and a controller divided between mouse firmware and a host driver.",
    requiredConceptIds: [
      "pressure-responsive-element",
      "distributed-controller",
      "pressure-to-scroll-mapping",
    ],
    forbiddenNeedlessLimitations: ["wheel", "single-processor location"],
  },
]);

const EVIDENCE_FACTS = Object.freeze([
  {
    id: "fact-a-pressure-mouse",
    referenceId: "ref-a",
    pinpointIds: ["ref-a-claims-2-5", "ref-a-paragraphs"],
    proposition:
      "Reference A supplies a pressure-responsive mouse scrolling element and pressure-dependent scrolling output.",
    conceptIds: [
      "pressure-responsive-element",
      "pressure-value",
      "scrolling-command",
      "scrolling-amount",
    ],
    mappingStrength: "strong",
  },
  {
    id: "fact-a-fsr",
    referenceId: "ref-a",
    pinpointIds: ["ref-a-paragraphs"],
    proposition: "Reference A supplies a force-sensitive-resistor implementation.",
    conceptIds: ["pressure-sensor"],
    mappingStrength: "strong",
  },
  {
    id: "fact-b-learned-scroll",
    referenceId: "ref-b",
    pinpointIds: ["ref-b-claims-1-4-7", "ref-b-paragraph-34"],
    proposition:
      "Reference B supplies learning-based selection or tuning of scroll speed or sensitivity from scrolling behavior.",
    conceptIds: ["historical-adaptation", "scrolling-amount"],
    mappingStrength: "strong",
  },
  {
    id: "fact-b-reverse-correction",
    referenceId: "ref-b",
    pinpointIds: ["ref-b-paragraph-29"],
    proposition:
      "Reference B supplies use of a rapid scroll followed by a short opposite-direction correction as feedback.",
    conceptIds: ["correction-sequence", "correction-interval"],
    mappingStrength: "strong",
  },
  {
    id: "fact-c-profile-parameters",
    referenceId: "ref-c",
    pinpointIds: ["ref-c-claims-11-16", "ref-c-paragraph-46"],
    proposition:
      "Reference C supplies stored compensation parameters associated with a user or application.",
    conceptIds: ["profile-specific-mapping", "historical-adaptation"],
    mappingStrength: "strong",
  },
  {
    id: "fact-d-pressure-ranges",
    referenceId: "ref-d",
    pinpointIds: ["ref-d-claim-9", "ref-d-calibration"],
    proposition:
      "Reference D supplies pressure ranges associated with mouse sensitivity states and calibration using measured pressure samples.",
    conceptIds: ["pressure-value", "pressure-interval", "mapping-value"],
    mappingStrength: "strong",
  },
  {
    id: "fact-d-context",
    referenceId: "ref-d",
    pinpointIds: ["ref-d-claim-11"],
    proposition:
      "Reference D supplies state criteria associated with applications, user settings, or usage habits.",
    conceptIds: ["profile-specific-mapping", "historical-adaptation"],
    mappingStrength: "strong",
  },
  {
    id: "fact-d-editable-curve",
    referenceId: "ref-d",
    pinpointIds: ["ref-d-curve-editing"],
    proposition:
      "Reference D permits modification of selected response-curve points or individual parameters.",
    conceptIds: ["mapping-value", "selective-interval-update"],
    mappingStrength: "partial",
    qualification:
      "The cited disclosure is not tied to correction labels or per-pressure-interval correction statistics.",
  },
  {
    id: "fact-e-direction-change",
    referenceId: "ref-e",
    pinpointIds: ["ref-e-paragraph-70"],
    proposition: "Reference E discusses changes in input direction.",
    conceptIds: ["correction-sequence"],
    mappingStrength: "partial",
    qualification:
      "The fixed pinpoint does not establish the entire claimed pressure-associated correction record.",
  },
  {
    id: "fact-e-range-response-update",
    referenceId: "ref-e",
    pinpointIds: ["ref-e-paragraphs-74-77"],
    proposition:
      "Reference E supplies discrete pressure ranges mapped to scrolling speeds and modification of the pressure-to-output relationship in response to a stimulus.",
    conceptIds: [
      "pressure-interval",
      "scrolling-amount",
      "mapping-value",
      "selective-interval-update",
    ],
    mappingStrength: "strong",
  },
]);

const REJECTION_RECIPES = Object.freeze([
  {
    id: "reject-initial-claim-1-core",
    recordId: "core-record",
    claimIds: ["initial-claim-1"],
    statute: "35 U.S.C. 103",
    outcome: "rejected-in-simulation",
    referenceIds: ["ref-a", "ref-b"],
    corroboratingReferenceIds: ["ref-d"],
    evidenceFactIds: ["fact-a-pressure-mouse", "fact-b-learned-scroll"],
    rationale:
      "Within the exercise, Reference A's pressure-dependent scrolling relationship and Reference B's learned adjustment are combined as a predictable way to personalize scrolling response.",
    whyNotAnticipation:
      "No single reference in the fixed evidence key maps every limitation of initial claim 1.",
    confidence: "medium",
  },
  {
    id: "reject-initial-claim-2-core",
    recordId: "core-record",
    claimIds: ["initial-claim-2"],
    statute: "35 U.S.C. 103",
    outcome: "rejected-in-simulation",
    referenceIds: ["ref-a", "ref-b"],
    inheritedFromRecipeId: "reject-initial-claim-1-core",
    evidenceFactIds: [
      "fact-a-pressure-mouse",
      "fact-b-learned-scroll",
      "fact-b-reverse-correction",
    ],
    rationale:
      "References A and B supply the inherited limitations, and Reference B additionally uses a short opposite-direction correction to reduce later speed or acceleration.",
    confidence: "high-within-key",
  },
  {
    id: "no-complete-map-initial-claims-3-4",
    recordId: "core-record",
    claimIds: ["initial-claim-3", "initial-claim-4"],
    statute: "bounded-record mapping",
    outcome: "amendment-target-not-allowance",
    referenceIds: ["ref-a", "ref-b", "ref-c", "ref-d"],
    evidenceFactIds: [
      "fact-a-pressure-mouse",
      "fact-b-reverse-correction",
      "fact-d-pressure-ranges",
      "fact-d-editable-curve",
    ],
    missingCombinationConceptIds: [
      "interaction-record",
      "correction-label",
      "correction-measure",
      "selective-interval-update",
    ],
    rationale:
      "The core record does not expressly map a stored pressure-and-correction label, a correction measure calculated for each pressure interval, and selective change of the implicated interval while retaining another interval. The fixed examiner supplies no complete articulated rationale for that combined architecture.",
    caution:
      "The absence of an express teaching does not itself defeat obviousness. Claims 3 and 4 depend from rejected claims and are identified only as amendment targets.",
    confidence: "medium",
  },
  {
    id: "reject-initial-claim-5-core",
    recordId: "core-record",
    claimIds: ["initial-claim-5"],
    statute: "35 U.S.C. 103",
    outcome: "rejected-in-simulation",
    referenceIds: ["ref-a", "ref-b", "ref-c"],
    corroboratingReferenceIds: ["ref-d"],
    inheritedFromRecipeId: "reject-initial-claim-1-core",
    evidenceFactIds: [
      "fact-a-pressure-mouse",
      "fact-b-learned-scroll",
      "fact-c-profile-parameters",
      "fact-d-context",
    ],
    rationale:
      "References A and B supply the inherited limitations, while Reference C supplies parameters stored by application. Reference D corroborates application-sensitive configuration.",
    confidence: "high-within-key",
  },
  {
    id: "reject-initial-claim-6-core",
    recordId: "core-record",
    claimIds: ["initial-claim-6"],
    statute: "35 U.S.C. 103",
    outcome: "rejected-in-simulation",
    referenceIds: ["ref-a", "ref-b"],
    inheritedFromRecipeId: "reject-initial-claim-1-core",
    evidenceFactIds: ["fact-a-pressure-mouse", "fact-a-fsr", "fact-b-learned-scroll"],
    rationale:
      "References A and B supply the inherited limitations, and Reference A supplies the force-sensitive-resistor refinement.",
    confidence: "high-within-key",
  },
  {
    id: "withdraw-amended-claim-1-core",
    recordId: "core-record",
    claimIds: ["amended-claim-1"],
    statute: "35 U.S.C. 103",
    outcome: "rejection-withdrawn-within-core-record",
    referenceIds: ["ref-a", "ref-b", "ref-c", "ref-d"],
    evidenceFactIds: [
      "fact-a-pressure-mouse",
      "fact-b-reverse-correction",
      "fact-d-pressure-ranges",
      "fact-d-editable-curve",
    ],
    rationale:
      "The fixed core examiner does not locate a complete mapping or articulate why the cited teachings would produce the claimed pressure-labeled records, per-interval correction measures, and localized update that retains another interval value.",
    resultCopy:
      "The rejection is withdrawn within this frozen challenge record. Amended claim 1 survives the supplied core references for this exercise.",
    caution:
      "This is one plausible answer-key outcome, not a conclusion concerning actual patentability or an exhaustive obviousness analysis.",
    confidence: "medium",
  },
  {
    id: "maintain-amended-claim-1-alternate",
    recordId: "alternate-core-record",
    claimIds: ["amended-claim-1"],
    statute: "35 U.S.C. 103",
    outcome: "alternate-rejection-maintained",
    referenceIds: ["ref-a", "ref-b", "ref-d"],
    evidenceFactIds: [
      "fact-a-pressure-mouse",
      "fact-b-reverse-correction",
      "fact-d-pressure-ranges",
      "fact-d-editable-curve",
    ],
    rationale:
      "An alternate examiner could reason that Reference D already divides pressure response into ranges and permits curve-parameter edits, while Reference B supplies correction-based learning. Applying the feedback separately to existing ranges and retaining an unaffected range could be characterized as a predictable software implementation.",
    caution:
      "This alternate is deliberately preserved because the core withdrawal is not a high-confidence real-world patentability conclusion.",
    confidence: "medium",
  },
  {
    id: "maintain-amended-claim-1-expert",
    recordId: "expert-record",
    claimIds: ["amended-claim-1"],
    statute: "35 U.S.C. 103",
    outcome: "rejection-maintained-in-examiner-mode",
    referenceIds: ["ref-a", "ref-b", "ref-d", "ref-e"],
    evidenceFactIds: [
      "fact-a-pressure-mouse",
      "fact-b-reverse-correction",
      "fact-d-pressure-ranges",
      "fact-d-editable-curve",
      "fact-e-direction-change",
      "fact-e-range-response-update",
    ],
    rationale:
      "The expert record adds range-specific scroll speeds and stimulus-responsive pressure-to-output modification, materially strengthening the rationale for applying correction feedback to separate pressure ranges. The answer key therefore requires an additional supported distinction, comparative evidence, or a stronger reasoned response.",
    caution:
      "The expert outcome is still a bounded simulation and is not a patentability conclusion.",
    confidence: "medium",
  },
]);

const MAPPING_CHALLENGE_RULINGS = Object.freeze([
  {
    id: "ruling-a-not-learning",
    prompt: "Reference A alone anticipates initial claim 1 because pressure controls scrolling.",
    challengedFindingId: "reject-initial-claim-1-core",
    ruling: "challenge-sustained",
    explanation:
      "The fixed evidence for Reference A does not map updating the pressure-to-scroll mapping from a history. The key uses A with B under Section 103 rather than A alone under Section 102.",
    evidenceFactIds: ["fact-a-pressure-mouse", "fact-b-learned-scroll"],
  },
  {
    id: "ruling-b-no-pressure-intervals",
    prompt:
      "Reference B's reverse-scroll learning necessarily supplies pressure-associated correction statistics.",
    challengedFindingId: "no-complete-map-initial-claims-3-4",
    ruling: "challenge-sustained",
    explanation:
      "The fixed B pinpoints supply correction-based learning but do not supply a measured pressure value, pressure assignment, or correction measure calculated for a pressure interval.",
    evidenceFactIds: ["fact-b-learned-scroll", "fact-b-reverse-correction"],
  },
  {
    id: "ruling-d-never-edits-curve",
    prompt: "Reference D never permits a response-curve value to be changed.",
    challengedFindingId: "withdraw-amended-claim-1-core",
    ruling: "challenge-denied",
    explanation:
      "The fixed D card permits selected curve points or parameters to be modified. The narrower distinction is that the cited modification is not driven by the claimed pressure-associated correction labels and per-interval statistics.",
    evidenceFactIds: ["fact-d-editable-curve"],
  },
  {
    id: "ruling-withdrawal-is-certain",
    prompt: "The core answer key proves amended claim 1 is patentable.",
    challengedFindingId: "withdraw-amended-claim-1-core",
    ruling: "challenge-denied",
    explanation:
      "The core result is only a medium-confidence simulated withdrawal. The alternate A+B+D ruling remains plausible, and undisclosed references or rationales may exist.",
    evidenceFactIds: [
      "fact-a-pressure-mouse",
      "fact-b-reverse-correction",
      "fact-d-pressure-ranges",
      "fact-d-editable-curve",
    ],
  },
  {
    id: "ruling-global-gain-maps-selective-update",
    prompt:
      "The competitor's global gain necessarily maps updating one pressure interval while retaining another interval value.",
    challengedFindingId: "competitor-amended-claim-1-map",
    ruling: "challenge-sustained",
    explanation:
      "In the stipulated competitor model, one multiplier changes the whole curve. The model does not calculate per-interval measures or retain another interval's mapping value during a localized update.",
    evidenceFactIds: [],
  },
]);

const COMPETITOR_MODEL = Object.freeze({
  id: "globalgain-mouse",
  name: "GlobalGain Mouse",
  fictional: true,
  roundTitle: "Competitor attack: global calibration",
  productFacts: [
    "uses a pressure-sensitive scrolling strip",
    "detects opposite-direction correction sequences",
    "calculates one global gain multiplier from all detected correction sequences",
    "multiplies every part of the pressure-to-scroll curve by the global gain",
    "does not calculate correction measures for separate pressure intervals",
  ],
  targetClaimId: "amended-claim-1",
  mappingId: "competitor-amended-claim-1-map",
  limitationMappings: [
    {
      limitationId: "a1-preamble",
      status: "mapped",
      explanation: "The fictional product is a computer mouse input system.",
    },
    {
      limitationId: "a1-pressure-element",
      status: "mapped",
      explanation: "The pressure-sensitive scrolling strip produces pressure values.",
    },
    {
      limitationId: "a1-interface",
      status: "mapped",
      explanation: "The stipulated product communicates scrolling commands to a host.",
    },
    {
      limitationId: "a1-processors",
      status: "mapped",
      explanation: "The stipulated product uses a controller to implement its gain behavior.",
    },
    {
      limitationId: "a1-interval-mapping",
      status: "disputed",
      explanation:
        "The curve may be described over pressure regions, but the stipulated model maintains one global gain rather than distinct learned values associated with respective intervals.",
    },
    {
      limitationId: "a1-labeled-records",
      status: "partial",
      explanation:
        "The product detects correction sequences, but the model does not stipulate records pairing each earlier pressure value with a correction label.",
    },
    {
      limitationId: "a1-assign-records",
      status: "not-mapped",
      explanation: "All correction events feed one global calculation and are not assigned by pressure interval.",
    },
    {
      limitationId: "a1-determine-measures",
      status: "not-mapped",
      explanation: "The product calculates one global measure, not respective measures for pressure intervals.",
    },
    {
      limitationId: "a1-selective-update",
      status: "not-mapped",
      explanation:
        "The global multiplier changes the whole curve and does not update one interval while retaining another interval's value.",
    },
    {
      limitationId: "a1-receive-current-pressure",
      status: "mapped",
      explanation: "The pressure-sensitive strip supplies a current pressure value.",
    },
    {
      limitationId: "a1-select-interval",
      status: "disputed",
      explanation:
        "A runtime curve lookup can use the current pressure, but the model does not stipulate selection from separately learned pressure intervals.",
    },
    {
      limitationId: "a1-determine-output",
      status: "mapped",
      explanation: "The curve and global gain produce a scrolling amount.",
    },
    {
      limitationId: "a1-communicate-output",
      status: "mapped",
      explanation: "The product communicates the resulting scrolling command.",
    },
  ],
  result: {
    status: "no-complete-literal-mapping-in-stipulated-model",
    headline: "Apparent literal design-around located",
    explanation:
      "The stipulated global-gain product appears to omit assigning pressure-associated records to pressure intervals, calculating a correction measure for each interval, and selectively updating one interval while retaining another interval's value.",
    teachingPoint:
      "The amendment uses a technically meaningful relationship rather than incidental hardware, but global calibration may retain commercial value while avoiding the localized-update relationship in the fictional model.",
    boundary: EDUCATIONAL_BOUNDARY.competitor,
  },
});

const SCORING = Object.freeze({
  gates: [
    {
      id: "formal-support-gate",
      label: "Formal and support gate",
      passRequirement:
        "The claim is complete, reasonably clear, and supported by the supplied fictional disclosure.",
    },
    {
      id: "coverage-gate",
      label: "Coverage gate",
      passRequirement: "At least one useful claim covers every required target embodiment.",
    },
    {
      id: "prior-art-gate",
      label: "Prior-art gate",
      passRequirement:
        "At least one commercially useful claim survives the applicable frozen challenge record.",
    },
  ],
  weights: [
    { id: "scope", label: "Scope and hidden-variant coverage", weight: 25 },
    { id: "support", label: "Support and clarity", weight: 20 },
    { id: "prior-art", label: "Prior-art resilience", weight: 20 },
    { id: "fallbacks", label: "Dependent-claim ladder", weight: 15 },
    { id: "design-around", label: "Design-around resistance", weight: 15 },
    { id: "efficiency", label: "Claim and prosecution efficiency", weight: 5 },
  ],
  portfolioCosts: [
    "redundant claims",
    "needless limitations",
    "unsupported additions",
    "claim budget exceeded",
  ],
  principles: [
    "Threshold gates are not exchangeable for points in another category.",
    "Immediate simulated allowance is not automatically a strong score if the surviving claim is unnecessarily narrow.",
    "A score reports performance only within this fixed challenge record.",
  ],
  benchmarks: [
    {
      fixtureKey: "amendedClaims",
      recordId: "core-record",
      total: 76,
      breakdown: {
        scope: 20,
        supportClarity: 18,
        priorArtResilience: 12,
        dependentLadder: 13,
        designAroundResistance: 9,
        efficiency: 4,
      },
      note:
        "This benchmark calibrates the model amendment within the core frozen record. A substantively different claim set must be rescored rather than receiving the fixture total by string similarity.",
    },
  ],
  workedResult: {
    recordId: "core-record",
    gates: {
      "formal-support-gate": "pass",
      "coverage-gate": "pass",
      "prior-art-gate": "pass-within-record",
    },
    categoryScores: {
      scope: 20,
      support: 18,
      "prior-art": 12,
      fallbacks: 13,
      "design-around": 9,
      efficiency: 4,
    },
    total: 76,
    debrief:
      "The amended portfolio is supported and covers the required hardware and processing variants, but it is vulnerable to an alternate obviousness rationale and a global-gain design-around.",
  },
});

const GLOSSARY = Object.freeze([
  {
    id: "glossary-antecedent-basis",
    term: "antecedent basis",
    definition:
      "A drafting relationship that makes clear which previously introduced claim element a later reference identifies.",
    help: "Introduce an element before referring to it as 'the' or 'said' element.",
  },
  {
    id: "glossary-dependent-claim",
    term: "dependent claim",
    definition:
      "A claim that refers to an earlier claim and adds a further limitation to the inherited combination.",
    help:
      "Start from a noun or relationship already introduced in the parent, then add a supported fallback with commercial or prosecution value.",
  },
  {
    id: "glossary-anticipation",
    term: "anticipation",
    definition:
      "For this simulator, a single reference must map every limitation of the claim under the fixed evidence rules.",
    help: "A multiple-reference mapping belongs in the obviousness analysis, not the anticipation label.",
  },
  {
    id: "glossary-obviousness",
    term: "obviousness",
    definition:
      "A simulated whole-claim assessment that may combine references only with an articulated reason grounded in the challenge record.",
    help: "Finding separate pieces is not enough; inspect the stated reason for combining them.",
  },
  {
    id: "glossary-written-description",
    term: "written-description support",
    definition:
      "Subject matter conveyed by the original fictional disclosure rather than invented during amendment.",
    help: "Every added limitation should trace to one or more support anchors.",
  },
  {
    id: "glossary-literal-mapping",
    term: "literal mapping",
    definition:
      "A limitation-by-limitation comparison to the stipulated fictional product facts in this exercise.",
    help:
      "No complete mapping located is deliberately narrower than saying a product does not infringe.",
  },
  {
    id: "glossary-frozen-record",
    term: "frozen record",
    definition:
      "The stipulated references, evidence facts, and evaluator rules used to keep a challenge replay reasonably stable.",
    help: "It is not represented as a complete prior-art search.",
  },
]);

const HELP_TEXT = Object.freeze({
  drafting: [
    "Write one complete claim sentence. ScopeCraft manages numbering, indentation, semicolons, and the final period.",
    "Use broad supported nouns for the independent claim, then build fallbacks from nouns and relationships already introduced.",
    "Avoid a specific wheel, sensor technology, or processor location unless you intentionally want that narrowing effect.",
  ],
  mechanicalPreflight: [
    "Check dependency, claim numbering, sentence completion, first use of each term, and possible antecedent-basis defects.",
    "A mechanical warning identifies an issue to review; it is not an automatic legal conclusion.",
  ],
  evidence: [
    "Open each evidence fact to see its reference and pinpoint.",
    "Challenge a mapping when the cited evidence does not appear to support the stated proposition.",
    "The simulator uses bounded phrases such as 'likely within this record' and 'no complete mapping located.'",
  ],
  amendment: [
    "Promote supported relational substance before adding incidental hardware.",
    "The amendment checker should reject concepts with no disclosure anchor and show the claim diff before submission.",
  ],
  competitor: [
    "Compare each claim limitation to the stipulated competitor product facts.",
    "Do not convert a missing mapping into a real noninfringement conclusion.",
  ],
});

const EVALUATOR_ONLY = Object.freeze({
  visibility: "evaluator-only",
  fixtures: {
    initialClaims: INITIAL_CLAIMS,
    amendedClaims: AMENDED_CLAIMS,
    amendedDependencyTree: {
      "1": [],
      "2": [1],
      "3": [2, 1],
      "4": [1],
      "5": [1],
      "6": [1],
    },
    revealPolicy:
      "Model claims are evaluator fixtures. A player view may reveal them only after the attempt is complete and the debrief has begun.",
  },
  hiddenTargetEmbodiments: TARGET_EMBODIMENTS,
  expertReference: EXPERT_REFERENCE,
  evidenceFacts: EVIDENCE_FACTS,
  rejectionRecipes: REJECTION_RECIPES,
  mappingChallengeRulings: MAPPING_CHALLENGE_RULINGS,
  competitor: COMPETITOR_MODEL,
  scoring: SCORING,
  answerKey: {
    coreRecord: {
      initialOutcome: "claims-1-2-5-6-rejected-claims-3-4-identified-as-amendment-targets",
      amendmentOutcome: "medium-confidence-withdrawal-within-core-record",
      controllingRecipeIds: [
        "reject-initial-claim-1-core",
        "reject-initial-claim-2-core",
        "no-complete-map-initial-claims-3-4",
        "reject-initial-claim-5-core",
        "reject-initial-claim-6-core",
        "withdraw-amended-claim-1-core",
      ],
      preservedAlternateRecipeId: "maintain-amended-claim-1-alternate",
    },
    expertRecord: {
      initialOutcome: "core-rejections-plus-expert-record",
      amendmentOutcome: "rejection-maintained-in-examiner-mode",
      controllingRecipeIds: ["maintain-amended-claim-1-expert"],
    },
    modelArgumentPoints: [
      "Reference A changes scrolling speed from current pressure but does not supply the claimed learning history.",
      "Reference B learns from direction reversals but does not associate a later correction with the pressure that produced the preceding output.",
      "Reference D uses pressure ranges and editable curve parameters but does not turn later reverse scrolling into a label for an earlier pressure sample.",
      "Reference C stores user or application parameters but does not supply pressure-interval correction measures.",
      "The core rationale does not completely explain the claimed pressure-labeled records, separate interval statistics, and localized update that retains another interval value.",
    ],
  },
});

export const challenge01PlayerFacing = deepFreeze({
  schemaVersion: "1.0.0",
  contentVersion: "1.0.0",
  challengeId: "challenge-01-pressure-history-adaptive-mouse",
  metadata: {
    number: 1,
    slug: "pressure-history-adaptive-mouse",
    title: "Pressure-History Adaptive Mouse",
    jurisdiction: "US",
    practiceType: "utility-patent drafting simulation",
    gameRounds: [
      "disclosure review",
      "claim drafting",
      "mechanical preflight",
      "simulated Office Action",
      "amendment or argument",
      "competitor attack",
      "portfolio debrief",
    ],
    claimCategory: ["system", "apparatus"],
    specificationVersion: "0.1",
    specificationDate: "2026-08-24",
    bundleDate: "2026-08-24",
    stipulatedEffectiveFilingDate: "2025-01-02",
    priorArtStipulation:
      "For this exercise only, every reference included in the selected mode is stipulated to be available prior art. The player is not asked to analyze statutory prior-art dates.",
    revisionNotes: [
      "Initial playable data bundle derived from ScopeCraft MVP Product Specification and Worked Challenge 01.",
      "Core record uses References A through D; Examiner mode adds the expert reference after initial submission.",
    ],
  },
  modes: DIFFICULTY_MODES,
  ...PLAYER_FACING,
  glossary: GLOSSARY,
  help: HELP_TEXT,
});

export const challenge01EvaluatorData = deepFreeze(EVALUATOR_ONLY);

export const challenge01 = deepFreeze({
  ...challenge01PlayerFacing,
  fixtures: challenge01EvaluatorData.fixtures,
  evaluator: challenge01EvaluatorData,
});

export function getChallenge01ForMode(
  modeId = "practitioner",
  { stage = "drafting", includeEvaluator = false } = {},
) {
  const mode = DIFFICULTY_MODES[modeId];
  if (!mode) {
    throw new RangeError(`Unknown Challenge 01 mode: ${modeId}`);
  }

  const validStages = new Set(["drafting", "office-action", "amendment", "competitor", "debrief"]);
  if (!validStages.has(stage)) {
    throw new RangeError(`Unknown Challenge 01 stage: ${stage}`);
  }

  const afterSubmission = stage !== "drafting";
  const visibleReferenceIds = afterSubmission
    ? mode.visibleReferenceIdsAfterSubmission
    : mode.visibleReferenceIdsAtDrafting;
  const allCards = [...CORE_REFERENCES, EXPERT_REFERENCE];
  const references = allCards.filter((reference) => visibleReferenceIds.includes(reference.id));

  const view = cloneData(challenge01PlayerFacing);
  view.activeMode = cloneData(mode);
  view.activeStage = stage;
  view.priorArt.cards = cloneData(references);
  view.priorArt.locked = references.length === 0;
  view.priorArt.lockedMessage =
    references.length === 0
      ? "References are concealed until the initial claim set is submitted in Examiner mode."
      : null;

  if (mode.revealTargetEmbodiments) {
    view.disclosure.targetEmbodiments = cloneData(TARGET_EMBODIMENTS);
  }

  if (includeEvaluator) {
    view.evaluator = cloneData(challenge01EvaluatorData);
  }

  return deepFreeze(view);
}

export function validateChallengeBundle(bundle = challenge01) {
  const errors = [];
  const add = (path, message) => errors.push(`${path}: ${message}`);
  const requiredObject = (value, path) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      add(path, "must be an object");
      return false;
    }
    return true;
  };
  const requiredArray = (value, path, minimum = 1) => {
    if (!Array.isArray(value) || value.length < minimum) {
      add(path, `must be an array with at least ${minimum} item(s)`);
      return false;
    }
    return true;
  };
  const requireString = (value, path) => {
    if (typeof value !== "string" || value.trim() === "") {
      add(path, "must be a non-empty string");
      return false;
    }
    return true;
  };
  const ensureUnique = (values, path) => {
    const duplicate = values.find((value, index) => values.indexOf(value) !== index);
    if (duplicate !== undefined) add(path, `contains duplicate value ${duplicate}`);
  };

  if (!requiredObject(bundle, "bundle")) return { valid: false, errors };
  if (!/^\d+\.\d+\.\d+$/.test(bundle.schemaVersion ?? "")) {
    add("schemaVersion", "must be semantic version text");
  }
  if (!/^\d+\.\d+\.\d+$/.test(bundle.contentVersion ?? "")) {
    add("contentVersion", "must be semantic version text");
  }
  requireString(bundle.challengeId, "challengeId");

  if (requiredObject(bundle.metadata, "metadata")) {
    for (const field of [
      "title",
      "jurisdiction",
      "bundleDate",
      "stipulatedEffectiveFilingDate",
      "priorArtStipulation",
    ]) {
      requireString(bundle.metadata[field], `metadata.${field}`);
    }
    for (const field of ["bundleDate", "stipulatedEffectiveFilingDate"]) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(bundle.metadata[field] ?? "")) {
        add(`metadata.${field}`, "must use YYYY-MM-DD");
      }
    }
  }

  if (requiredObject(bundle.modes, "modes")) {
    for (const modeId of ["guided", "practitioner", "examiner"]) {
      const mode = bundle.modes[modeId];
      if (!requiredObject(mode, `modes.${modeId}`)) continue;
      if (mode.id !== modeId) add(`modes.${modeId}.id`, `must equal ${modeId}`);
      if (!Number.isInteger(mode.claimBudget?.total) || mode.claimBudget.total < 1) {
        add(`modes.${modeId}.claimBudget.total`, "must be a positive integer");
      }
      if (!Array.isArray(mode.visibleReferenceIdsAtDrafting)) {
        add(`modes.${modeId}.visibleReferenceIdsAtDrafting`, "must be an array");
      }
      if (!Array.isArray(mode.visibleReferenceIdsAfterSubmission)) {
        add(`modes.${modeId}.visibleReferenceIdsAfterSubmission`, "must be an array");
      }
    }
  }

  const anchors = bundle.disclosure?.anchors ?? [];
  const alternatives = bundle.disclosure?.supportedAlternatives ?? [];
  const sections = bundle.disclosure?.sections ?? [];
  requiredArray(sections, "disclosure.sections", 5);
  requiredArray(anchors, "disclosure.anchors", 1);
  requiredArray(alternatives, "disclosure.supportedAlternatives", 10);
  const anchorIds = anchors.map((anchor) => anchor.id);
  ensureUnique(anchorIds, "disclosure.anchors[].id");
  for (const [index, anchor] of anchors.entries()) {
    requireString(anchor.id, `disclosure.anchors[${index}].id`);
    requireString(anchor.text, `disclosure.anchors[${index}].text`);
    if (!sections.some((section) => section.id === anchor.sectionId)) {
      add(`disclosure.anchors[${index}].sectionId`, `unknown section ${anchor.sectionId}`);
    }
  }
  for (const [index, alternative] of alternatives.entries()) {
    if (!anchorIds.includes(alternative.supportAnchorId)) {
      add(
        `disclosure.supportedAlternatives[${index}].supportAnchorId`,
        `unknown anchor ${alternative.supportAnchorId}`,
      );
    }
    requiredArray(alternative.values, `disclosure.supportedAlternatives[${index}].values`, 1);
  }

  const concepts = bundle.lexicon?.concepts ?? [];
  const relations = bundle.lexicon?.relations ?? [];
  requiredArray(concepts, "lexicon.concepts", 1);
  requiredArray(relations, "lexicon.relations", 1);
  const conceptIds = concepts.map((concept) => concept.id);
  ensureUnique(conceptIds, "lexicon.concepts[].id");
  for (const [index, relation] of relations.entries()) {
    for (const [field, value] of [
      ["subjectId", relation.subjectId],
      ["objectId", relation.objectId],
    ]) {
      if (!conceptIds.includes(value)) {
        add(`lexicon.relations[${index}].${field}`, `unknown concept ${value}`);
      }
    }
  }

  const coreReferences = bundle.priorArt?.cards ?? [];
  requiredArray(coreReferences, "priorArt.cards", 4);
  const evaluator = bundle.evaluator;
  if (!requiredObject(evaluator, "evaluator")) {
    return { valid: false, errors };
  }
  if (evaluator.visibility !== "evaluator-only") {
    add("evaluator.visibility", "must be evaluator-only");
  }
  const allReferences = [
    ...coreReferences,
    ...(evaluator.expertReference ? [evaluator.expertReference] : []),
  ];
  const referenceIds = allReferences.map((reference) => reference.id);
  ensureUnique(referenceIds, "references[].id");
  for (const [modeId, mode] of Object.entries(bundle.modes ?? {})) {
    for (const referenceId of [
      ...(mode.visibleReferenceIdsAtDrafting ?? []),
      ...(mode.visibleReferenceIdsAfterSubmission ?? []),
    ]) {
      if (!referenceIds.includes(referenceId)) {
        add(`modes.${modeId}.visibleReferenceIds`, `unknown reference ${referenceId}`);
      }
    }
  }
  for (const [index, reference] of allReferences.entries()) {
    const path = `references[${index}]`;
    for (const field of ["id", "publicationNumber", "title", "publicationDate", "sourceUrl"]) {
      requireString(reference[field], `${path}.${field}`);
    }
    if (!reference.sourceUrl?.startsWith("https://")) {
      add(`${path}.sourceUrl`, "must be an HTTPS source URL");
    }
    if (/\.pdf(?:$|\?)/i.test(reference.sourceUrl ?? "")) {
      add(`${path}.sourceUrl`, "must not embed or directly target a patent PDF");
    }
    requiredArray(reference.pinpoints, `${path}.pinpoints`, 1);
    const snapshot = reference.frozenEvidenceManifest;
    if (!requiredObject(snapshot, `${path}.frozenEvidenceManifest`)) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(snapshot.retrievalDate ?? "")) {
      add(`${path}.frozenEvidenceManifest.retrievalDate`, "must use YYYY-MM-DD");
    }
    if (!/^[a-f0-9]{64}$/.test(snapshot.contentHash ?? "")) {
      add(`${path}.frozenEvidenceManifest.contentHash`, "must be a 64-character SHA-256 digest");
    }
  }

  for (const [setName, claims] of Object.entries(bundle.fixtures ?? {})) {
    if (!setName.endsWith("Claims")) continue;
    if (!requiredArray(claims, `fixtures.${setName}`, 6)) continue;
    if (claims.length !== 6) add(`fixtures.${setName}`, "must contain exactly six claims");
    const numbers = claims.map((item) => item.number);
    if (numbers.some((number, index) => number !== index + 1)) {
      add(`fixtures.${setName}[].number`, "must be sequential from 1 through 6");
    }
    const limitationIds = [];
    for (const [index, item] of claims.entries()) {
      requireString(item.id, `fixtures.${setName}[${index}].id`);
      requireString(item.text, `fixtures.${setName}[${index}].text`);
      requiredArray(item.limitations, `fixtures.${setName}[${index}].limitations`, 1);
      if (item.number === 1 && item.dependsOn !== null) {
        add(`fixtures.${setName}[${index}].dependsOn`, "independent claim must not depend on another claim");
      }
      if (item.number > 1 && (!Number.isInteger(item.dependsOn) || item.dependsOn >= item.number)) {
        add(`fixtures.${setName}[${index}].dependsOn`, "must identify an earlier claim number");
      }
      for (const [limitationIndex, limitation] of (item.limitations ?? []).entries()) {
        limitationIds.push(limitation.id);
        for (const conceptId of limitation.conceptIds ?? []) {
          if (!conceptIds.includes(conceptId)) {
            add(
              `fixtures.${setName}[${index}].limitations[${limitationIndex}].conceptIds`,
              `unknown concept ${conceptId}`,
            );
          }
        }
        for (const anchorId of limitation.supportAnchorIds ?? []) {
          if (!anchorIds.includes(anchorId)) {
            add(
              `fixtures.${setName}[${index}].limitations[${limitationIndex}].supportAnchorIds`,
              `unknown anchor ${anchorId}`,
            );
          }
        }
      }
    }
    ensureUnique(limitationIds, `fixtures.${setName}[].limitations[].id`);
  }

  const evidenceFacts = evaluator.evidenceFacts ?? [];
  requiredArray(evidenceFacts, "evaluator.evidenceFacts", 1);
  const evidenceFactIds = evidenceFacts.map((fact) => fact.id);
  ensureUnique(evidenceFactIds, "evaluator.evidenceFacts[].id");
  const pinpointIds = allReferences.flatMap((reference) =>
    reference.pinpoints.map((pinpoint) => pinpoint.id),
  );
  for (const [index, fact] of evidenceFacts.entries()) {
    if (!referenceIds.includes(fact.referenceId)) {
      add(`evaluator.evidenceFacts[${index}].referenceId`, `unknown reference ${fact.referenceId}`);
    }
    for (const pinpointId of fact.pinpointIds ?? []) {
      if (!pinpointIds.includes(pinpointId)) {
        add(`evaluator.evidenceFacts[${index}].pinpointIds`, `unknown pinpoint ${pinpointId}`);
      }
    }
    for (const conceptId of fact.conceptIds ?? []) {
      if (!conceptIds.includes(conceptId)) {
        add(`evaluator.evidenceFacts[${index}].conceptIds`, `unknown concept ${conceptId}`);
      }
    }
  }

  const allClaimIds = [
    ...(bundle.fixtures?.initialClaims ?? []),
    ...(bundle.fixtures?.amendedClaims ?? []),
  ].map((item) => item.id);
  const recipes = evaluator.rejectionRecipes ?? [];
  requiredArray(recipes, "evaluator.rejectionRecipes", 1);
  const recipeIds = recipes.map((recipe) => recipe.id);
  ensureUnique(recipeIds, "evaluator.rejectionRecipes[].id");
  for (const [index, recipe] of recipes.entries()) {
    for (const claimId of recipe.claimIds ?? []) {
      if (!allClaimIds.includes(claimId)) {
        add(`evaluator.rejectionRecipes[${index}].claimIds`, `unknown claim ${claimId}`);
      }
    }
    for (const referenceId of [
      ...(recipe.referenceIds ?? []),
      ...(recipe.corroboratingReferenceIds ?? []),
    ]) {
      if (!referenceIds.includes(referenceId)) {
        add(`evaluator.rejectionRecipes[${index}].referenceIds`, `unknown reference ${referenceId}`);
      }
    }
    for (const factId of recipe.evidenceFactIds ?? []) {
      if (!evidenceFactIds.includes(factId)) {
        add(`evaluator.rejectionRecipes[${index}].evidenceFactIds`, `unknown fact ${factId}`);
      }
    }
    if (recipe.inheritedFromRecipeId && !recipeIds.includes(recipe.inheritedFromRecipeId)) {
      add(
        `evaluator.rejectionRecipes[${index}].inheritedFromRecipeId`,
        `unknown recipe ${recipe.inheritedFromRecipeId}`,
      );
    }
  }

  requiredArray(evaluator.mappingChallengeRulings, "evaluator.mappingChallengeRulings", 1);
  const competitor = evaluator.competitor;
  if (requiredObject(competitor, "evaluator.competitor")) {
    const target = (bundle.fixtures?.amendedClaims ?? []).find(
      (item) => item.id === competitor.targetClaimId,
    );
    if (!target) add("evaluator.competitor.targetClaimId", "must identify an amended claim");
    const mappedIds = (competitor.limitationMappings ?? []).map((mapping) => mapping.limitationId);
    const targetIds = target?.limitations.map((limitation) => limitation.id) ?? [];
    if (targetIds.some((id) => !mappedIds.includes(id))) {
      add("evaluator.competitor.limitationMappings", "must address every target-claim limitation");
    }
    if (mappedIds.some((id) => !targetIds.includes(id))) {
      add("evaluator.competitor.limitationMappings", "contains an unknown target-claim limitation");
    }
    if (!/not a noninfringement opinion/i.test(competitor.result?.boundary ?? "")) {
      add("evaluator.competitor.result.boundary", "must preserve the noninfringement boundary");
    }
  }

  const scoring = evaluator.scoring;
  if (requiredObject(scoring, "evaluator.scoring")) {
    const totalWeight = (scoring.weights ?? []).reduce((sum, item) => sum + item.weight, 0);
    if (totalWeight !== 100) add("evaluator.scoring.weights", "must sum to 100");
    const workedTotal = Object.values(scoring.workedResult?.categoryScores ?? {}).reduce(
      (sum, value) => sum + value,
      0,
    );
    if (workedTotal !== scoring.workedResult?.total) {
      add("evaluator.scoring.workedResult.total", "must equal the category-score sum");
    }
  }

  if (!requiredArray(evaluator.hiddenTargetEmbodiments, "evaluator.hiddenTargetEmbodiments", 3)) {
    add("evaluator.hiddenTargetEmbodiments", "must preserve all target embodiments");
  }
  for (const [index, target] of (evaluator.hiddenTargetEmbodiments ?? []).entries()) {
    for (const conceptId of target.requiredConceptIds ?? []) {
      if (!conceptIds.includes(conceptId)) {
        add(
          `evaluator.hiddenTargetEmbodiments[${index}].requiredConceptIds`,
          `unknown concept ${conceptId}`,
        );
      }
    }
  }
  if (Object.hasOwn(bundle.disclosure ?? {}, "targetEmbodiments")) {
    add("disclosure.targetEmbodiments", "must remain outside the base player-facing disclosure");
  }

  const boundaryText = [
    bundle.educationalBoundary?.full,
    bundle.educationalBoundary?.final,
    bundle.priorArt?.statusNotice,
  ]
    .filter(Boolean)
    .join(" ");
  if (!/not legal advice/i.test(boundaryText)) add("educationalBoundary", "must say it is not legal advice");
  if (!/not.*patentability/i.test(boundaryText)) {
    add("educationalBoundary", "must disclaim a real patentability conclusion");
  }
  if (!/not.*infringement|not.*noninfringement/i.test(boundaryText)) {
    add("educationalBoundary", "must disclaim a real infringement or noninfringement conclusion");
  }

  return { valid: errors.length === 0, errors };
}

export function assertValidChallengeBundle(bundle = challenge01) {
  const result = validateChallengeBundle(bundle);
  if (!result.valid) {
    throw new Error(`Invalid ScopeCraft challenge bundle:\n${result.errors.join("\n")}`);
  }
  return bundle;
}

function cloneData(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== "object") return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.isFrozen(value) ? value : Object.freeze(value);
}

assertValidChallengeBundle(challenge01);
