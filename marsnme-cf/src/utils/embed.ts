import { Env } from "../types/index.js";

const EMBEDDING_MODEL = "@cf/baai/bge-base-en-v1.5";
const VECTOR_DIMENSIONS = 768;

/**
 * Generate embedding vector for text using Workers AI.
 * Returns a 768-dimension vector (bge-base-en-v1.5).
 */
export async function embed(text: string, env: Env): Promise<number[]> {
  const result = await env.AI.run(EMBEDDING_MODEL as unknown as string, {
    text: [text],
  });
  // Workers AI returns { data: number[][], shape: number[] }
  const data = (result as { data: number[][] }).data;
  if (!data || !data[0]) {
    throw new Error("Embedding failed: no data returned from AI model");
  }
  return data[0];
}

export { VECTOR_DIMENSIONS };
