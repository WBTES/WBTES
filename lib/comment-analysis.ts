import type {
  CommentAnalysis,
  CommentTheme,
  FeedbackType,
  WeightedCommentAnalysis,
  WeightedFeedbackGroup,
  WeightedFeedbackTheme,
} from "@/lib/types";

export const COMMENT_WEIGHTING_FACTOR = 0.5;

const THEME_RULES: Array<{
  name: string;
  words: string[];
}> = [
  {
    name: "Subject knowledge",
    words: ["knowledge", "knowledgeable", "expert", "mastery", "content", "subject"],
  },
  {
    name: "Explanation and clarity",
    words: ["clear", "clarity", "explain", "explanation", "understand", "confusing", "instructions"],
  },
  {
    name: "Communication",
    words: ["communicate", "communication", "speaks", "voice", "listen", "responsive"],
  },
  {
    name: "Feedback and assessment",
    words: ["feedback", "check", "grading", "grade", "exam", "quiz", "assessment", "return"],
  },
  {
    name: "Student engagement",
    words: ["engaging", "engagement", "interactive", "activities", "participation", "interesting"],
  },
  {
    name: "Classroom management",
    words: ["classroom", "discipline", "manage", "organized", "organisation", "environment"],
  },
  {
    name: "Pacing and workload",
    words: ["pace", "fast", "slow", "workload", "deadline", "time", "rushed"],
  },
  {
    name: "Professionalism and fairness",
    words: ["professional", "respect", "fair", "fairness", "bias", "punctual", "prepared"],
  },
  {
    name: "Support and availability",
    words: ["helpful", "support", "available", "approachable", "consultation", "patient"],
  },
  {
    name: "Practical activities",
    words: ["practical", "hands-on", "exercise", "exercises", "laboratory", "activity", "activities"],
  },
  {
    name: "Examples and discussion",
    words: ["example", "examples", "discussion", "discussions", "demonstration"],
  },
  {
    name: "Equal treatment and attention",
    words: ["favoritism", "favouritism", "unequal", "attention", "bias", "biased"],
  },
  {
    name: "Personal phone use",
    words: ["phone", "cellphone", "mobile", "texting"],
  },
];

const POSITIVE_WORDS = [
  "good",
  "great",
  "excellent",
  "clear",
  "helpful",
  "patient",
  "fair",
  "engaging",
  "organized",
  "professional",
  "knowledgeable",
  "effective",
  "best",
  "love",
];

const IMPROVEMENT_WORDS = [
  "improve",
  "needs",
  "need",
  "should",
  "could",
  "confusing",
  "unclear",
  "fast",
  "slow",
  "late",
  "difficult",
  "more",
  "less",
  "wish",
  "lack",
];

const SUGGESTION_WORDS = [
  "suggest",
  "suggestion",
  "recommend",
  "please",
  "could",
  "should",
  "would",
  "more",
  "less",
  "wish",
  "hope",
  "increase",
  "provide",
  "include",
];

const CONCERN_WORDS = [
  "favoritism",
  "favouritism",
  "unequal",
  "unfair",
  "bias",
  "biased",
  "phone",
  "cellphone",
  "texting",
  "rude",
  "disrespectful",
  "unprofessional",
  "late",
  "absent",
  "poor",
  "boring",
  "confusing",
  "unclear",
  "never",
  "not",
  "lack",
  "lacking",
  "reduced",
];

export function consolidateComments(comments: string[]): {
  uniqueComments: string[];
  analysis: CommentAnalysis;
} {
  const cleaned = comments
    .map((comment) => comment.trim())
    .filter(Boolean);
  const uniqueMap = new Map<string, string>();
  cleaned.forEach((comment) => {
    const normalized = normalizeComment(comment);
    if (normalized && !uniqueMap.has(normalized)) uniqueMap.set(normalized, comment);
  });
  const uniqueComments = [...uniqueMap.values()];
  const groups = new Map<string, {
    count: number;
    positive: number;
    improvement: number;
    examples: string[];
  }>();

  uniqueComments.forEach((comment) => {
    const normalized = normalizeComment(comment);
    const tokens = new Set(normalized.split(" ").filter((token) => token.length > 2));
    const themes = THEME_RULES
      .filter((theme) => theme.words.some((word) => tokens.has(word)))
      .map((theme) => theme.name);
    const selectedThemes = themes.length > 0 ? themes : ["General teaching experience"];
    const positive = POSITIVE_WORDS.filter((word) => tokens.has(word)).length;
    const improvement = IMPROVEMENT_WORDS.filter((word) => tokens.has(word)).length;
    selectedThemes.forEach((theme) => {
      const group = groups.get(theme) ?? {
        count: 0,
        positive: 0,
        improvement: 0,
        examples: [],
      };
      group.count += 1;
      group.positive += positive;
      group.improvement += improvement;
      if (group.examples.length < 3) group.examples.push(comment);
      groups.set(theme, group);
    });
  });

  const themes: CommentTheme[] = [...groups.entries()]
    .map(([name, group]) => ({
      name,
      count: group.count,
      sentiment: sentiment(group.positive, group.improvement),
      examples: group.examples,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const commonStrengths = themes
    .filter((theme) => theme.sentiment === "positive")
    .slice(0, 4)
    .map((theme) => theme.name);
  const areasForImprovement = themes
    .filter((theme) => theme.sentiment === "improvement")
    .slice(0, 4)
    .map((theme) => theme.name);
  const duplicatesRemoved = cleaned.length - uniqueComments.length;
  const summary = uniqueComments.length === 0
    ? "No written student comments were submitted."
    : [
        `${uniqueComments.length} unique comment${uniqueComments.length === 1 ? "" : "s"} were analyzed`,
        duplicatesRemoved > 0
          ? `after removing ${duplicatesRemoved} duplicate${duplicatesRemoved === 1 ? "" : "s"}`
          : "with no exact duplicates",
        themes.length > 0
          ? `The most common theme was ${themes[0].name.toLowerCase()}.`
          : "",
      ].filter(Boolean).join(" ");

  return {
    uniqueComments,
    analysis: {
      totalComments: cleaned.length,
      uniqueComments: uniqueComments.length,
      duplicatesRemoved,
      themes,
      commonStrengths,
      areasForImprovement,
      summary,
    },
  };
}

export function analyzeWeightedComments(
  comments: string[],
  weightingFactor = COMMENT_WEIGHTING_FACTOR
): WeightedCommentAnalysis {
  const factor = Number.isFinite(weightingFactor)
    ? Math.min(Math.max(weightingFactor, 0), 1)
    : COMMENT_WEIGHTING_FACTOR;
  const cleaned = comments.map((comment) => comment.trim()).filter(Boolean);
  const grouped = new Map<FeedbackType, {
    comments: string[];
    themes: Map<string, { count: number; examples: string[] }>;
  }>();

  (["positive", "suggestion", "improvement"] as FeedbackType[]).forEach((type) => {
    grouped.set(type, { comments: [], themes: new Map() });
  });

  cleaned.forEach((comment) => {
    const normalized = normalizeComment(comment);
    const tokens = new Set(normalized.split(" ").filter(Boolean));
    const type = classifyFeedback(tokens);
    const group = grouped.get(type)!;
    group.comments.push(comment);
    const themes = matchingThemes(tokens);
    themes.forEach((theme) => {
      const item = group.themes.get(theme) ?? { count: 0, examples: [] };
      item.count += 1;
      if (item.examples.length < 3 && !item.examples.includes(comment)) {
        item.examples.push(comment);
      }
      group.themes.set(theme, item);
    });
  });

  const groups: WeightedFeedbackGroup[] = (
    ["positive", "suggestion", "improvement"] as FeedbackType[]
  ).map((type) => {
    const group = grouped.get(type)!;
    const themes: WeightedFeedbackTheme[] = [...group.themes.entries()]
      .map(([name, item]) => ({
        name,
        rawCount: item.count,
        weightedCount: weightedCount(item.count, factor),
        examples: item.examples,
      }))
      .sort((a, b) => b.rawCount - a.rawCount || a.name.localeCompare(b.name));
    return {
      type,
      label: feedbackLabel(type),
      rawCount: group.comments.length,
      weightedCount: weightedCount(group.comments.length, factor),
      themes,
      summary: feedbackSummary(type, group.comments.length, themes),
    };
  });

  return {
    weightingFactor: factor,
    totalComments: cleaned.length,
    groups,
  };
}

function classifyFeedback(tokens: Set<string>): FeedbackType {
  const positive = POSITIVE_WORDS.filter((word) => tokens.has(word)).length;
  const suggestions = SUGGESTION_WORDS.filter((word) => tokens.has(word)).length;
  const concerns = CONCERN_WORDS.filter((word) => tokens.has(word)).length;
  if (concerns > 0 && concerns >= suggestions) return "improvement";
  if (suggestions > 0) return "suggestion";
  if (positive > 0) return "positive";
  return IMPROVEMENT_WORDS.some((word) => tokens.has(word))
    ? "suggestion"
    : "positive";
}

function matchingThemes(tokens: Set<string>) {
  const matches = THEME_RULES
    .filter((theme) => theme.words.some((word) => tokens.has(word)))
    .map((theme) => theme.name);
  return matches.length > 0 ? matches : ["General teaching experience"];
}

function weightedCount(rawCount: number, factor: number) {
  return Math.ceil(rawCount * factor);
}

function feedbackLabel(type: FeedbackType) {
  if (type === "positive") return "Positive feedback";
  if (type === "suggestion") return "Suggestions";
  return "Areas for improvement";
}

function feedbackSummary(
  type: FeedbackType,
  count: number,
  themes: WeightedFeedbackTheme[]
) {
  if (count === 0) return `No ${feedbackLabel(type).toLowerCase()} was identified.`;
  const names = themes.slice(0, 3).map((theme) => theme.name.toLowerCase());
  const themeList = names.length > 1
    ? `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`
    : names[0];
  if (type === "positive") {
    return `Students most often recognized ${themeList}.`;
  }
  if (type === "suggestion") {
    return `Students most often suggested improvements related to ${themeList}.`;
  }
  return `The most frequently reported concerns involved ${themeList}. HR review and appropriate follow-up may be considered.`;
}

function normalizeComment(comment: string) {
  return comment
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sentiment(
  positive: number,
  improvement: number
): CommentTheme["sentiment"] {
  if (positive > improvement) return "positive";
  if (improvement > positive) return "improvement";
  return "mixed";
}
