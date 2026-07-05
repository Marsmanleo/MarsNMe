import { Env } from "../types/index.js";

export interface VectorMetadata {
  profile: string;
  type: "memory" | "insight";
  id: string;
}

/**
 * Insert a single vector into Vectorize with typed metadata.
 */
export async function insertVector(
  env: Env,
  vectorId: string,
  values: number[],
  metadata: VectorMetadata
): Promise<void> {
  await env.VECTORIZE.insert([
    {
      id: vectorId,
      values,
      metadata: metadata as unknown as Record<string, string>,
    },
  ]);
}

/**
 * Delete vectors by their IDs.
 */
export async function deleteVectors(env: Env, vectorIds: string[]): Promise<void> {
  if (vectorIds.length === 0) return;
  await env.VECTORIZE.deleteByIds(vectorIds);
}

/**
 * Query Vectorize for similar vectors, filtered by profile.
 */
export async function queryVectors(
  env: Env,
  embedding: number[],
  options: {
    topK: number;
    profile: string;
    type?: "memory" | "insight";
  }
): Promise<Array<{ id: string; score: number; metadata?: VectorMetadata }>> {
  // NOTE: Vectorize metadata filters are not working as expected.
  // Temporary workaround: query without filter, then manually filter by profile in code.
  // TODO: Investigate correct Vectorize filter syntax for metadata fields.
  const result = await env.VECTORIZE.query(embedding, {
    topK: options.topK * 3, // Fetch more to allow for profile filtering
    returnMetadata: "all",
  });

  return (result.matches || [])
    .filter((match) => {
      const meta = match.metadata as unknown as VectorMetadata | undefined;
      if (!meta) return false;
      if (meta.profile !== options.profile) return false;
      if (options.type && meta.type !== options.type) return false;
      return true;
    })
    .slice(0, options.topK)
    .map((match) => ({
      id: match.id,
      score: match.score,
      metadata: match.metadata as unknown as VectorMetadata | undefined,
    }));
}
