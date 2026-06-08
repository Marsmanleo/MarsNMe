// LinguaMCP — TypeScript types and exports
// MARS-280

// ============================================================
// Schema types
// ============================================================

export interface SkillBook {
  id: string;
  slug: string;
  title: string;
  description: string;
  source_url: string | null;
  language: string;
  total_chapters: number;
  created_at: string;
  updated_at: string;
}

export interface Chapter {
  id: string;
  skill_book_id: string;
  chapter_number: number;
  title: string;
  description: string;
  created_at: string;
}

export type LessonType = "tip" | "exercise" | "concept" | "dialogue";
export type Difficulty = "beginner" | "intermediate" | "advanced";
export type ProgressStatus =
  | "new"
  | "seen"
  | "practiced"
  | "mastered"
  | "skipped";

export interface Lesson {
  id: string;
  chapter_id: string;
  lesson_number: number;
  title: string;
  content: string;
  lesson_type: LessonType;
  difficulty: Difficulty;
  tags: string[];
  created_at: string;
}

export interface UserProgress {
  id: string;
  user_id: string;
  lesson_id: string;
  status: ProgressStatus;
  response: string | null;
  score: number | null;
  practiced_at: string;
  created_at: string;
}

export interface DailySession {
  id: string;
  user_id: string;
  session_date: string;
  lesson_ids: string[];
  notes: string;
  completed_at: string | null;
  created_at: string;
}

// ============================================================
// Tool response types
// ============================================================

export interface TodayLessonResponse {
  ok: boolean;
  lesson: {
    id: string;
    title: string;
    content: string;
    type: LessonType;
    difficulty: Difficulty;
    tags: string[];
  } | null;
  context: {
    skill_book: { slug: string; title: string } | null;
    chapter: { number: number; title: string } | null;
    lesson_number: number;
  } | null;
  message?: string;
}

export interface ProgressStats {
  total: number;
  new: number;
  seen: number;
  practiced: number;
  mastered: number;
  skipped: number;
}

export interface UserProgressResponse {
  ok: boolean;
  user_id: string;
  overall: ProgressStats;
  today: {
    session_id: string;
    session_date: string;
    total_lessons: number;
    practiced: number;
    mastered: number;
    remaining: number;
  } | null;
}

export interface LogResponseResponse {
  ok: boolean;
  lesson_id: string;
  status: ProgressStatus;
  scored: number | null;
  error?: string;
}
