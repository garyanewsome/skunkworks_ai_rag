/** Shared grouping for lecture video dropdowns (Prompt, Office Hours, …). */

export type VideoItem = { video_id: string; chunk_count: number; title?: string | null };

export type LectureGroup = {
  groupKey: string;
  topicLabel: string;
  videos: VideoItem[];
};

/** Split YouTube title on first "|" (course-style titles often use "Course | Part"). */
export function parseTitleSides(title: string | null | undefined): { left: string; right: string } {
  const t = (title || '').trim();
  const i = t.indexOf('|');
  if (i < 0) return { left: t, right: '' };
  return { left: t.slice(0, i).trim(), right: t.slice(i + 1).trim() };
}

/** Right-hand side after "|", for display and topic-only grouping. */
export function topicSuffix(title: string | null | undefined): string {
  return parseTitleSides(title).right;
}

/** Titles like "Advanced Quantum Mechanics Lecture 3" (no "|") → course prefix before numbered segment. */
export function coursePrefixBeforeNumberedLecture(title: string | null | undefined): string | null {
  const t = (title || '').trim();
  if (!t) return null;
  const m = t.match(
    /^(.+)\s+(?:lecture|lectures|part|parts|week|weeks|class|classes|episode|episodes)\s*\d+\s*$/i,
  );
  const prefix = m?.[1]?.trim();
  return prefix || null;
}

/**
 * Group key for one video:
 * - If "|" exists and the right side looks like "lecture 1", "part 2", … → group by **left** course name
 * - Else if "|" exists → group by **right** topic text
 * - Else if the whole title ends with "… Lecture N" / "… Part N" (no "|") → group by that prefix
 * - Else → one group per video id
 */
export function lectureGroupKey(v: VideoItem): string {
  const { left, right } = parseTitleSides(v.title);
  if (right) {
    const numberedPart = /^(lecture|lectures|part|parts|week|weeks|class|classes|episode|episodes)\s*\d+/i.test(
      right.trim(),
    );
    if (numberedPart && left) return `p:${left.toLowerCase()}`;
    return `t:${right.toLowerCase()}`;
  }
  const noPipePrefix = coursePrefixBeforeNumberedLecture(v.title);
  if (noPipePrefix) return `p:${noPipePrefix.toLowerCase()}`;
  return `v:${v.video_id}`;
}

export function headerLabelForGroup(groupKey: string, items: VideoItem[]): string {
  const first = items[0];
  if (groupKey.startsWith('p:')) {
    const piped = parseTitleSides(first.title);
    if (piped.right) return piped.left || first.title || first.video_id;
    return coursePrefixBeforeNumberedLecture(first.title) || first.title || first.video_id;
  }
  if (groupKey.startsWith('t:')) {
    return topicSuffix(first.title) || first.title || first.video_id;
  }
  return first.title || first.video_id;
}

export function buildLectureGroups(videos: VideoItem[]): {
  lectureGroups: LectureGroup[];
  groupByKey: Record<string, LectureGroup>;
} {
  const m = new Map<string, VideoItem[]>();
  for (const v of videos) {
    const key = lectureGroupKey(v);
    const arr = m.get(key) ?? [];
    arr.push(v);
    m.set(key, arr);
  }
  const groupByKey: Record<string, LectureGroup> = {};
  const lectureGroups: LectureGroup[] = [];
  for (const [groupKey, items] of m.entries()) {
    items.sort((a, b) => (a.title || a.video_id).localeCompare(b.title || b.video_id));
    const topicLabel = headerLabelForGroup(groupKey, items);
    const lg: LectureGroup = { groupKey, topicLabel, videos: items };
    lectureGroups.push(lg);
    groupByKey[groupKey] = lg;
  }
  lectureGroups.sort((a, b) => a.topicLabel.localeCompare(b.topicLabel));
  return { lectureGroups, groupByKey };
}
