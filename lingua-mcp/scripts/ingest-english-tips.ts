// LinguaMCP — Ingest English-level-up-tips into lingua schema
// MARS-280
// Usage: npx tsx scripts/ingest-english-tips.ts
//
// Clones the repo, parses markdown files, and inserts into Supabase
// via PostgREST (same pattern as server.mjs — direct REST, no SQL RPC).

import { execSync } from "child_process";
import { readFileSync, existsSync, rmSync } from "fs";
import { join } from "path";

// ============================================================
// Config
// ============================================================

const SUPABASE_BASE_URL =
  process.env.SUPABASE_BASE_URL || "http://127.0.0.1:8100";
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  "";
const SCHEMA = "lingua";
const REPO_URL = "https://github.com/byoungd/English-level-up-tips.git";
const CLONE_DIR = "/tmp/lingua-mcp-english-tips";

// ============================================================
// Supabase REST helpers (same pattern as server.mjs)
// Uses Accept-Profile / Content-Profile for lingua schema
// ============================================================

const headers: Record<string, string> = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
  Accept: "application/json",
  "Accept-Profile": SCHEMA,
  "Content-Profile": SCHEMA,
};

async function insertRow(
  table: string,
  data: Record<string, unknown>
): Promise<Record<string, unknown>[]> {
  const url = `${SUPABASE_BASE_URL}/rest/v1/${table}?select=*`;
  const response = await fetch(url, {
    method: "POST",
    headers: { ...headers, Prefer: "return=representation" },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Insert ${table} failed ${response.status}: ${text}`);
  }

  return response.json();
}

async function selectRows(
  table: string,
  query: string
): Promise<Record<string, unknown>[]> {
  const url = `${SUPABASE_BASE_URL}/rest/v1/${table}?${query}`;
  const response = await fetch(url, { headers });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Select ${table} failed ${response.status}: ${text}`);
  }

  return response.json();
}

// ============================================================
// Chapter / Lesson mapping
// ============================================================

interface LessonDef {
  file: string;
  title: string;
  lessonType: "tip" | "exercise" | "concept" | "dialogue";
  difficulty: "beginner" | "intermediate" | "advanced";
  tags: string[];
}

interface ChapterDef {
  number: number;
  title: string;
  description: string;
  lessons: LessonDef[];
}

const CURRICULUM: ChapterDef[] = [
  {
    number: 1,
    title: "Core Skills",
    description:
      "7 fundamental areas of English learning: understanding, vocabulary, listening, reading, speaking, writing, and AI-assisted practice.",
    lessons: [
      {
        file: "threads/part-1/1-understanding.md",
        title: "Understanding — Mindset & Approach",
        lessonType: "concept",
        difficulty: "beginner",
        tags: ["mindset", "methodology"],
      },
      {
        file: "threads/part-1/2-vocabulary.md",
        title: "Vocabulary — Building Your Word Bank",
        lessonType: "tip",
        difficulty: "beginner",
        tags: ["vocabulary", "words"],
      },
      {
        file: "threads/part-1/3-listening.md",
        title: "Listening — Training Your Ear",
        lessonType: "tip",
        difficulty: "intermediate",
        tags: ["listening", "comprehension"],
      },
      {
        file: "threads/part-1/4-reading.md",
        title: "Reading — Input Through Text",
        lessonType: "tip",
        difficulty: "intermediate",
        tags: ["reading", "comprehension"],
      },
      {
        file: "threads/part-1/5-speaking.md",
        title: "Speaking — Output Practice",
        lessonType: "exercise",
        difficulty: "intermediate",
        tags: ["speaking", "output"],
      },
      {
        file: "threads/part-1/6-writing.md",
        title: "Writing — From Thought to Text",
        lessonType: "exercise",
        difficulty: "intermediate",
        tags: ["writing", "output"],
      },
      {
        file: "threads/part-1/7-ai.md",
        title: "AI-Assisted Learning (2026 Edition)",
        lessonType: "concept",
        difficulty: "intermediate",
        tags: ["ai", "tools", "modern"],
      },
    ],
  },
  {
    number: 2,
    title: "Stories & Practice",
    description:
      "Real stories and weekly practice exercises for applied learning.",
    lessons: [
      {
        file: "threads/part-2/x-misc.md",
        title: "Miscellaneous Tips & Stories",
        lessonType: "tip",
        difficulty: "intermediate",
        tags: ["stories", "tips"],
      },
      {
        file: "threads/part-2/my-story.md",
        title: "My English Learning Story",
        lessonType: "concept",
        difficulty: "beginner",
        tags: ["story", "motivation"],
      },
      {
        file: "threads/part-4/week-1.md",
        title: "Week 1 Practice Plan",
        lessonType: "exercise",
        difficulty: "beginner",
        tags: ["practice", "weekly"],
      },
    ],
  },
  {
    number: 3,
    title: "Word Lists by Domain",
    description:
      "Domain-specific vocabulary lists for IT professionals — Common, Programming Languages, and AI.",
    lessons: [
      {
        file: "threads/word-list/Common.md",
        title: "Common Words for IT",
        lessonType: "tip",
        difficulty: "beginner",
        tags: ["vocabulary", "common", "it"],
      },
      {
        file: "threads/word-list/Go.md",
        title: "Go Vocabulary",
        lessonType: "tip",
        difficulty: "intermediate",
        tags: ["vocabulary", "go", "programming"],
      },
      {
        file: "threads/word-list/Java.md",
        title: "Java Vocabulary",
        lessonType: "tip",
        difficulty: "intermediate",
        tags: ["vocabulary", "java", "programming"],
      },
      {
        file: "threads/word-list/JavaScript.md",
        title: "JavaScript Vocabulary",
        lessonType: "tip",
        difficulty: "intermediate",
        tags: ["vocabulary", "javascript", "programming"],
      },
      {
        file: "threads/word-list/PHP.md",
        title: "PHP Vocabulary",
        lessonType: "tip",
        difficulty: "intermediate",
        tags: ["vocabulary", "php", "programming"],
      },
      {
        file: "threads/word-list/Prompt.md",
        title: "AI Prompt Vocabulary",
        lessonType: "tip",
        difficulty: "advanced",
        tags: ["vocabulary", "ai", "prompt"],
      },
      {
        file: "threads/word-list/Python.md",
        title: "Python Vocabulary",
        lessonType: "tip",
        difficulty: "intermediate",
        tags: ["vocabulary", "python", "programming"],
      },
      {
        file: "threads/word-list/Swift.md",
        title: "Swift Vocabulary",
        lessonType: "tip",
        difficulty: "intermediate",
        tags: ["vocabulary", "swift", "programming"],
      },
      {
        file: "threads/word-list/Rust.md",
        title: "Rust Vocabulary",
        lessonType: "tip",
        difficulty: "advanced",
        tags: ["vocabulary", "rust", "programming"],
      },
      {
        file: "threads/word-list/VibeCoding.md",
        title: "Vibe Coding & Agent Vocabulary",
        lessonType: "tip",
        difficulty: "advanced",
        tags: ["vocabulary", "ai", "agent", "modern"],
      },
    ],
  },
];

// ============================================================
// Main
// ============================================================

async function main() {
  console.log("[ingest] LinguaMCP — Ingest English-level-up-tips");
  console.log(`[ingest] Supabase: ${SUPABASE_BASE_URL}`);

  if (!SERVICE_KEY) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY) is required"
    );
  }

  // 1. Clone repo
  if (existsSync(CLONE_DIR)) {
    console.log(`[ingest] Removing existing clone: ${CLONE_DIR}`);
    rmSync(CLONE_DIR, { recursive: true });
  }
  console.log(`[ingest] Cloning ${REPO_URL}...`);
  execSync(`git clone --depth 1 ${REPO_URL} ${CLONE_DIR}`, {
    stdio: "pipe",
  });
  console.log("[ingest] Clone complete");

  const docsDir = join(CLONE_DIR, "docs");

  // 2. Check for existing skill book (idempotent)
  const existing = await selectRows(
    "skill_books",
    "slug=eq.english-level-up-tips&select=id"
  );

  let skillBookId: string;

  if (existing.length > 0) {
    skillBookId = existing[0].id as string;
    console.log(
      `[ingest] Skill book already exists: ${skillBookId}. Skipping — use --reset to wipe and re-ingest.`
    );
    console.log("[ingest] Existing curriculum preserved. No changes made.");
    console.log("[ingest] ═══════════════════════════════");
    return;
  } else {
    // 3. Insert skill book
    const [book] = await insertRow("skill_books", {
      slug: "english-level-up-tips",
      title: "English Level Up Tips",
      description:
        "A comprehensive English learning guide for developers, covering understanding, vocabulary, listening, reading, speaking, writing, and AI-assisted practice.",
      source_url: REPO_URL,
      language: "en",
      total_chapters: CURRICULUM.length,
    });
    skillBookId = book.id as string;
    console.log(`[ingest] Created skill book: ${skillBookId}`);
  }

  // 4. Insert chapters + lessons
  let totalLessons = 0;

  for (const chapterDef of CURRICULUM) {
    const [chapter] = await insertRow("chapters", {
      skill_book_id: skillBookId,
      chapter_number: chapterDef.number,
      title: chapterDef.title,
      description: chapterDef.description,
    });
    const chapterId = chapter.id as string;
    console.log(
      `[ingest] Chapter ${chapterDef.number}: ${chapterDef.title} (${chapterId.slice(0, 8)})`
    );

    for (let i = 0; i < chapterDef.lessons.length; i++) {
      const lessonDef = chapterDef.lessons[i];
      const filePath = join(docsDir, lessonDef.file);

      if (!existsSync(filePath)) {
        console.warn(`[ingest] SKIP: ${lessonDef.file} not found`);
        continue;
      }

      const content = readFileSync(filePath, "utf-8");

      await insertRow("lessons", {
        chapter_id: chapterId,
        lesson_number: i + 1,
        title: lessonDef.title,
        content,
        lesson_type: lessonDef.lessonType,
        difficulty: lessonDef.difficulty,
        tags: lessonDef.tags,
      });

      totalLessons++;
    }

    console.log(
      `[ingest]   → ${chapterDef.lessons.length} lessons in chapter ${chapterDef.number}`
    );
  }

  // 5. Summary
  console.log("\n[ingest] ═══════════════════════════════");
  console.log(`[ingest] Done!`);
  console.log(`[ingest] Skill book: english-level-up-tips`);
  console.log(`[ingest] Chapters: ${CURRICULUM.length}`);
  console.log(`[ingest] Lessons: ${totalLessons}`);
  console.log("[ingest] ═══════════════════════════════");
}

main().catch((err) => {
  console.error("[ingest] FATAL:", err.message);
  process.exit(1);
});
