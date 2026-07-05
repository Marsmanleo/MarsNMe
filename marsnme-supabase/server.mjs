#!/usr/bin/env node
import http from 'node:http';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { AsyncLocalStorage } from 'node:async_hooks';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const PROFILE_CONFIGS = {
  coco: {
    schema: 'coco',
    displayName: 'CoCo',
    defaultPort: 18790,
    gatewayDir: 'coco-mcp-gateway',
    publicHostSuffix: 'coco-mcp.marsgroup.asia',
    sourceWhitelist: ['perplexity', 'cursor', 'warp', 'openclaw', 'hermes'],
    recallBodyEnum: ['coco', 'toto', 'system'],
    digestDefaultOrigin: 'hermes-coco-digest',
    memoryIngestToolName: 'memory_ingest',
    memoryIngestLegacyToolNames: ['coco_memory_ingest'],
    memoryIngestDefaultSourceFile: 'Coco/Memory/Ingest/auto.md',
    memoryIngestDefaultOrigin: 'warp-coco',
    memoryIngestOriginEnum: [
      'perplexity-coco',
      'cursor-coco',
      'warp-coco',
      'leo-manual',
      'hermes-coco-digest'
    ],
    memoryIngestFixedTags: ['coco', 'insight']
  },
  toto: {
    schema: 'toto',
    displayName: 'Toto',
    defaultPort: 18791,
    gatewayDir: 'toto-mcp-gateway',
    publicHostSuffix: 'toto-mcp.marsgroup.asia',
    sourceWhitelist: ['perplexity', 'cursor', 'warp', 'openclaw'],
    recallBodyEnum: ['toto', 'system'],
    digestDefaultOrigin: 'hermes-toto-digest',
    memoryIngestToolName: 'memory_ingest',
    memoryIngestLegacyToolNames: ['toto_memory_ingest'],
    memoryIngestDefaultSourceFile: 'Toto/Memory/Ingest/auto.md',
    memoryIngestDefaultOrigin: 'warp-toto',
    memoryIngestOriginEnum: null,
    memoryIngestFixedTags: ['toto', 'insight']
  }
};
const PROFILE_DEFAULT_PORT_RANGE_START = 20000;
const PROFILE_DEFAULT_PORT_RANGE_SIZE = 10000;
const PROFILE_LEGACY_DEFAULT_PORTS = {
  coco: 18790,
  toto: 18791
};
function resolveProfileDefaultPort(profileId) {
  const legacyPort = PROFILE_LEGACY_DEFAULT_PORTS[profileId];
  if (Number.isInteger(legacyPort)) return legacyPort;
  const hash = crypto.createHash('sha256').update(profileId).digest();
  const slot = hash.readUInt16BE(0) % PROFILE_DEFAULT_PORT_RANGE_SIZE;
  return PROFILE_DEFAULT_PORT_RANGE_START + slot;
}
const PROFILE_ID_PATTERN = /^[a-z][a-z0-9_-]*$/;
function buildProfileConfig(profileId) {
  const legacyProfile = PROFILE_CONFIGS[profileId];
  if (legacyProfile) return legacyProfile;
  return {
    ...PROFILE_CONFIGS.coco,
    schema: profileId,
    displayName: profileId,
    defaultPort: resolveProfileDefaultPort(profileId),
    gatewayDir: `${profileId}-mcp-gateway`,
    publicHostSuffix: `${profileId}-mcp.marsgroup.asia`,
    recallBodyEnum: [profileId, 'system'],
    memoryIngestLegacyToolNames: [],
    memoryIngestDefaultOrigin: `warp-${profileId}`,
    memoryIngestOriginEnum: null,
    memoryIngestFixedTags: [profileId, 'insight']
  };
}
const MCP_PROFILE = String(process.env.MCP_PROFILE || 'coco')
  .trim()
  .toLowerCase();
if (!MCP_PROFILE || !PROFILE_ID_PATTERN.test(MCP_PROFILE)) {
  throw new Error(`Invalid MCP_PROFILE: ${MCP_PROFILE}. Must match ^[a-z][a-z0-9_-]*$`);
}
const PROFILE = buildProfileConfig(MCP_PROFILE);

const DB_PROFILE = PROFILE.schema;
const SERVER_NAME = `${PROFILE.schema}-memory-mcp`;
const RECALL_BODY_VALIDATION_MESSAGE = `body must be one of ${PROFILE.recallBodyEnum.join('/')}`;
const SOURCE_NAME_PATTERN = /^[a-z][a-z0-9_-]{1,31}$/;
const SOURCE_MODE_VALUES = new Set(['core', 'extended', 'registry']);
const CORE_SOURCE_LIST = PROFILE.sourceWhitelist.slice();
const CORE_SOURCE_WHITELIST = new Set(CORE_SOURCE_LIST);
const CORE_SOURCE_VALIDATION_MESSAGE =
  `source must be one of ${CORE_SOURCE_LIST.join('/')}`;
function normalizeSourceName(value, fieldName = 'source') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  if (!normalized) return '';
  if (!SOURCE_NAME_PATTERN.test(normalized)) {
    throw new Error(`${fieldName} must match ^[a-z][a-z0-9_-]{1,31}$`);
  }
  return normalized;
}
function parseExtraSourceList(rawValue) {
  const raw = String(rawValue || '').trim();
  if (!raw) return [];
  const extras = [];
  const seen = new Set();
  const entries = raw.split(',');
  for (const entry of entries) {
    const source = normalizeSourceName(entry, 'MCP_EXTRA_SOURCES entry');
    if (!source) continue;
    if (CORE_SOURCE_WHITELIST.has(source) || seen.has(source)) continue;
    seen.add(source);
    extras.push(source);
  }
  return extras;
}
const SOURCE_MODE_RAW = String(process.env.MCP_SOURCE_MODE || 'core')
  .trim()
  .toLowerCase();
if (SOURCE_MODE_RAW && !SOURCE_MODE_VALUES.has(SOURCE_MODE_RAW)) {
  console.warn(
    `[config] invalid MCP_SOURCE_MODE=${SOURCE_MODE_RAW}; fallback to core`
  );
}
const SOURCE_MODE = SOURCE_MODE_VALUES.has(SOURCE_MODE_RAW)
  ? SOURCE_MODE_RAW
  : 'core';
const EXTRA_SOURCE_LIST =
  SOURCE_MODE === 'extended'
    ? parseExtraSourceList(process.env.MCP_EXTRA_SOURCES || '')
    : [];
const SOURCE_REGISTRY_TABLE = 'source_registry';
const SOURCE_REGISTRY_SELECT_COLUMNS = 'source,enabled';
const SOURCE_REGISTRY_CACHE = {
  loaded: false,
  loaded_at: null,
  enabled_sources: [],
  last_error: ''
};
let MEMORY_SOURCE_LIST = CORE_SOURCE_LIST.slice();
let MEMORY_SOURCE_WHITELIST = new Set(MEMORY_SOURCE_LIST);
let MEMORY_SOURCE_VALIDATION_MESSAGE =
  `source must be one of ${MEMORY_SOURCE_LIST.join('/')}`;

function buildMemorySourceListForMode(registryEnabledSources = []) {
  if (SOURCE_MODE === 'extended') {
    return Array.from(new Set([...CORE_SOURCE_LIST, ...EXTRA_SOURCE_LIST]));
  }
  if (SOURCE_MODE === 'registry') {
    return Array.from(new Set([...CORE_SOURCE_LIST, ...registryEnabledSources]));
  }
  return CORE_SOURCE_LIST.slice();
}
function setMemorySourceWhitelist(nextSources) {
  const sourceList = Array.from(new Set(Array.isArray(nextSources) ? nextSources : []));
  MEMORY_SOURCE_LIST = sourceList;
  MEMORY_SOURCE_WHITELIST = new Set(sourceList);
  MEMORY_SOURCE_VALIDATION_MESSAGE =
    `source must be one of ${MEMORY_SOURCE_LIST.join('/')}`;
}
setMemorySourceWhitelist(buildMemorySourceListForMode());

const PORT_RAW = String(process.env.PORT || '').trim();
const PORT_SOURCE = PORT_RAW ? 'env' : 'profile-default';
const PORT = Number.parseInt(PORT_RAW || String(PROFILE.defaultPort), 10);
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error(`Invalid PORT: ${PORT_RAW || String(PORT)}. Must be an integer between 1 and 65535.`);
}
const SUPABASE_BASE_URL = process.env.SUPABASE_BASE_URL || 'http://127.0.0.1:8100';
const SUPABASE_AUTH_MODE_VALUES = new Set(['service', 'anon', 'hybrid']);
const SUPABASE_AUTH_MODE_RAW = String(process.env.MCP_SUPABASE_AUTH_MODE || 'service')
  .trim()
  .toLowerCase();
if (SUPABASE_AUTH_MODE_RAW && !SUPABASE_AUTH_MODE_VALUES.has(SUPABASE_AUTH_MODE_RAW)) {
  console.warn(
    `[config] invalid MCP_SUPABASE_AUTH_MODE=${SUPABASE_AUTH_MODE_RAW}; fallback to service`
  );
}
const SUPABASE_AUTH_MODE = SUPABASE_AUTH_MODE_VALUES.has(SUPABASE_AUTH_MODE_RAW)
  ? SUPABASE_AUTH_MODE_RAW
  : 'service';
const SUPABASE_ANON_KEY = String(process.env.SUPABASE_ANON_KEY || '').trim();
const ANON_ALLOWED_TOOL_NAMES = new Set([
  'list_memories',
  'search_memories',
  'reload_source_registry',
  'recall',
  'health_check',
  'explain_memory'
]);
const SUPABASE_REQUEST_CONTEXT = new AsyncLocalStorage();
const OAUTH_ENABLED = process.env.MCP_OAUTH_ENABLED !== 'false';
const REQUIRE_BEARER = process.env.MCP_REQUIRE_BEARER === 'true';
const BYPASS_BEARER_FOR_PRIVATE = process.env.MCP_BYPASS_BEARER_FOR_PRIVATE !== 'false';
const OAUTH_CLIENTS_FILE =
  process.env.MCP_OAUTH_CLIENTS_FILE || `/opt/${PROFILE.gatewayDir}/oauth-clients.json`;
const OAUTH_ALLOW_UNKNOWN_CLIENT_SEED =
  process.env.MCP_OAUTH_ALLOW_UNKNOWN_CLIENT_SEED !== 'false';
const PUBLIC_HOST_SUFFIXES = String(
  process.env.MCP_PUBLIC_HOST_SUFFIXES || PROFILE.publicHostSuffix
)
  .split(',')
  .map((item) => item.trim().toLowerCase())
  .filter(Boolean);
const OAUTH_CODE_TTL_SECONDS = Number.parseInt(process.env.OAUTH_CODE_TTL_SECONDS || '300', 10);
const OAUTH_TOKEN_TTL_SECONDS = Number.parseInt(process.env.OAUTH_TOKEN_TTL_SECONDS || '3600', 10);
const OAUTH_REFRESH_TOKEN_TTL_SECONDS = Number.parseInt(
  process.env.OAUTH_REFRESH_TOKEN_TTL_SECONDS || '2592000',
  10
);
const STATIC_CLIENT_ID = (process.env.MCP_CLIENT_ID || '').trim();
const STATIC_CLIENT_SECRET = (process.env.MCP_CLIENT_SECRET || '').trim();
const JINA_API_KEY = (process.env.JINA_API_KEY || '').trim();
const JINA_EMBEDDING_API_URL = String(
  process.env.JINA_EMBEDDING_API_URL || 'https://api.jina.ai/v1/embeddings'
).trim();
const JINA_EMBEDDING_MODEL = String(
  process.env.JINA_EMBEDDING_MODEL || 'jina-embeddings-v3'
).trim();
const JINA_EMBEDDING_DIMENSIONS = Number.parseInt(
  process.env.JINA_EMBEDDING_DIMENSIONS || '1024',
  10
);
const JINA_EMBEDDING_DIMENSIONS_SAFE =
  Number.isFinite(JINA_EMBEDDING_DIMENSIONS) && JINA_EMBEDDING_DIMENSIONS > 0
    ? JINA_EMBEDDING_DIMENSIONS
    : 1024;
const CHUNK_VISIBILITY_WHITELIST = new Set(['private', 'shared', 'global']);
const CHUNK_BODY_WHITELIST = new Set(PROFILE.recallBodyEnum);
const COCO_MEMORY_INGEST_ORIGIN_WHITELIST = new Set([
  'perplexity-coco',
  'cursor-coco',
  'warp-coco',
  'leo-manual',
  'hermes-coco-digest'
]);
const DAILY_BOOT_QUERY_DEFAULTS = {
  coco: {
    identity_query: 'CoCo SOUL',
    workflow_subject: 'CoCo'
  },
  toto: {
    identity_query: 'Toto SOUL',
    workflow_subject: 'Toto'
  }
};
const DAILY_BOOT_STATUS_QUERY_SUFFIX = '最新狀態 本週任務';
const MEMORY_SCOPE_VALUES = new Set(['this_body', 'all_bodies']);
const SOURCE_TO_AGENT_BODY_MAP = new Map([
  ['perplexity', 'perplexity-web'],
  ['cursor', 'cursor'],
  ['warp', 'warp'],
  ['openclaw', 'desktop'],
  ['hermes', 'desktop']
]);
const DEFAULT_AGENT_BODY = String(process.env.MCP_AGENT_BODY || '')
  .trim()
  .toLowerCase();
const DEFAULT_ENVIRONMENT = String(process.env.MCP_ENVIRONMENT || 'desktop')
  .trim()
  .toLowerCase();
const MEMORY_SELECT_COLUMNS =
  'id,body,source,session_id,tags,agent_body,environment,promoted,promoted_at,created_at,expires_at';
const TOOL_USAGE_INSERT_SELECT_COLUMNS =
  'id,tool_name,timestamp,latency_ms,tokens_estimate,agent_body';
const TOOL_USAGE_TOKEN_CHAR_CAP = 400000;
const TOOL_USAGE_INGEST_NAMES = new Set([
  'dream_ingest',
  PROFILE.memoryIngestToolName,
  ...PROFILE.memoryIngestLegacyToolNames,
  'ingest_marsvault_digest'
]);
function buildMemoryIngestOriginSchema() {
  if (Array.isArray(PROFILE.memoryIngestOriginEnum) && PROFILE.memoryIngestOriginEnum.length > 0) {
    return {
      type: 'string',
      enum: PROFILE.memoryIngestOriginEnum,
      default: PROFILE.memoryIngestDefaultOrigin
    };
  }
  return {
    type: 'string',
    description: 'Origin marker',
    default: PROFILE.memoryIngestDefaultOrigin
  };
}
function buildMemorySourceSchema() {
  if (SOURCE_MODE === 'registry') {
    return {
      type: 'string',
      description:
        `Source key validated against core sources + enabled entries in ${DB_PROFILE}.${SOURCE_REGISTRY_TABLE}`
    };
  }
  return {
    type: 'string',
    enum: MEMORY_SOURCE_LIST
  };
}

function buildTools() {
  return [
    {
      name: 'insert_memory',
      description: `Store a short-term ${PROFILE.displayName} memory into ${DB_PROFILE}.memories (ephemeral context that auto-expires). Use this to capture observations, decisions, session notes, or any context worth remembering temporarily. Memories last 7 days by default unless expires_at is set. For permanent knowledge, use memory_ingest instead.`,
      inputSchema: {
        type: 'object',
        properties: {
          body: { type: 'string', description: 'The memory content to store. Be specific and include relevant context — this text is used for semantic search later.' },
          source: buildMemorySourceSchema(),
          session_id: { type: 'string', description: 'Unique identifier for the current session/conversation. Used to group related memories together.' },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Categorization labels for filtering (e.g. ["decision", "architecture", "bugfix"])'
          },
          expires_at: {
            type: 'string',
            description: 'Custom expiration time in ISO 8601 format (e.g. "2026-06-17T00:00:00Z"). Defaults to 7 days from now if omitted.'
          },
          agent_body: {
            type: 'string',
            description: 'Which persona/agent body this memory belongs to (e.g. "coco", "toto"). Defaults to the profile of this server.'
          },
          environment: {
            type: 'string',
            description: 'Deployment environment label (e.g. "production", "staging"). Defaults to MCP_ENVIRONMENT if set.'
          }
        },
        required: ['body', 'source', 'session_id'],
        additionalProperties: false
      }
    },
    {
      name: 'list_memories',
      description: `List recent short-term memories from ${DB_PROFILE}.memories in reverse chronological order — like a daily log or activity feed. Use this to review what was recently captured, check for duplicate memories before inserting, or browse recent activity. This is a time-ordered listing tool, not a search tool. For semantic search by meaning, use search_memories instead. For long-term knowledge retrieval, use recall. Returns memory body, source, creation time, and expiration status.`,
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number', minimum: 1, maximum: 100, default: 20, description: 'Maximum number of memories to return (default 20)' },
          source: buildMemorySourceSchema(),
          unexpired_only: { type: 'boolean', default: true, description: 'When true (default), only return memories that have not yet expired. Set false to include expired entries.' }
        },
        additionalProperties: false
      }
    },
    {
      name: 'search_memories',
      description: `Semantic search across short-term memories in ${DB_PROFILE}.memories using Jina embeddings. Finds memories by meaning, not just keywords — ask a natural language question and get the most relevant matches. Use this to recall past decisions, find related context, or check if something was already discussed recently.`,
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Natural language search query. Describe what you are looking for — semantic matching finds relevant results even without exact keywords.' },
          limit: { type: 'number', minimum: 1, maximum: 100, default: 20, description: 'Maximum number of results to return' },
          source: buildMemorySourceSchema(),
          unexpired_only: { type: 'boolean', default: true, description: 'When true (default), exclude expired memories from results' },
          min_similarity: { type: 'number', minimum: -1, maximum: 1, description: 'Minimum cosine similarity threshold for results (range -1 to 1). Higher values return fewer but more relevant matches.' },
          scope: { type: 'string', enum: ['this_body', 'all_bodies'], default: 'this_body', description: 'Search scope: "this_body" searches only the current profile, "all_bodies" searches across all personas.' },
          agent_body: {
            type: 'string',
            description: 'Filter results to a specific persona/body (e.g. "coco", "toto")'
          },
          environment: {
            type: 'string',
            description: 'Filter results to a specific environment (e.g. "production", "staging")'
          }
        },
        required: ['query'],
        additionalProperties: false
      }
    },
    {
      name: 'reload_source_registry',
      description:
        `Reload the source registry cache from ${DB_PROFILE}.${SOURCE_REGISTRY_TABLE}. Use this after adding or removing entries to refresh which sources are enabled for insert/search filtering. Only effective when running in registry mode (MCP_SOURCE_MODE=registry).`,
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false
      }
    },
    {
      name: 'recall',
      description: `Semantic recall from long-term memory (${DB_PROFILE}.marsvault_chunks) using Jina embeddings. Searches across promoted insights, digests, and archived knowledge using vector similarity. Use this to retrieve established patterns, past decisions, documented workflows, or any knowledge that was previously promoted to long-term storage. This is the primary tool for accessing institutional memory.`,
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Natural language query describing what knowledge you need. The system finds semantically similar chunks — describe the concept, not just keywords.' },
          limit: { type: 'number', minimum: 1, maximum: 50, default: 5, description: 'Maximum number of chunks to return (default 5)' },
          body: { type: 'string', enum: PROFILE.recallBodyEnum, default: DB_PROFILE, description: 'Which persona profile to search in (e.g. "coco", "toto", "system")' },
          include_global: { type: 'boolean', default: true, description: 'Include globally visible chunks in results' },
          include_shared: { type: 'boolean', default: true, description: 'Include shared-visibility chunks in results' },
          include_private: { type: 'boolean', default: true, description: 'Include private chunks in results' },
          type: { type: 'string', description: 'Filter by chunk type (e.g. "insight", "digest", "observation")' },
          min_similarity: { type: 'number', minimum: -1, maximum: 1, description: 'Minimum cosine similarity threshold. Raise for higher precision, lower for broader recall.' },
          scope: { type: 'string', enum: ['this_body', 'all_bodies'], default: 'this_body', description: 'Search scope: "this_body" for current profile only, "all_bodies" for cross-persona search' },
          agent_body: {
            type: 'string',
            description: 'Filter to a specific persona/body scope'
          },
          environment: {
            type: 'string',
            description: 'Filter to a specific environment label'
          },
          debug_explain: {
            type: 'boolean',
            default: false,
            description: 'When true, include token overlap details in each result for debugging relevance'
          }
        },
        required: ['query'],
        additionalProperties: false
      }
    },
    {
      name: 'health_check',
      description: `Run comprehensive ${PROFILE.displayName} memory system diagnostics. Returns chunk counts by type and visibility, identifies expiring short-term memories that need promotion, detects timeline coverage gaps, and finds conflicting or redundant long-term chunks. Use this regularly to maintain memory hygiene and before batch promotion.`,
      inputSchema: {
        type: 'object',
        properties: {
          alert_window_hours: {
            type: 'number',
            minimum: 1,
            maximum: 720,
            default: 48,
            description: 'Alert when short-term memories will expire within this window'
          },
          gap_days: {
            type: 'number',
            minimum: 7,
            maximum: 365,
            default: 30,
            description: 'Detect long-memory timeline gaps over this day threshold'
          },
          topic_limit: {
            type: 'number',
            minimum: 1,
            maximum: 20,
            default: 5,
            description: 'Maximum topics to return for rich/sparse/volatile sections'
          },
          page_size: {
            type: 'number',
            minimum: 100,
            maximum: 2000,
            default: 1000,
            description: 'Pagination size for loading rows from Supabase'
          },
          max_rows: {
            type: 'number',
            minimum: 1000,
            maximum: 50000,
            default: 20000,
            description: 'Safety cap for total rows loaded per table'
          },
          conflict_similarity_threshold: {
            type: 'number',
            minimum: 0,
            maximum: 1,
            default: 0.85,
            description: 'Similarity threshold for conflict candidate detection'
          },
          conflict_window_days: {
            type: 'number',
            minimum: 1,
            maximum: 120,
            default: 14,
            description: 'Within this day window classify similar pairs as CONFLICT (otherwise SUPERSEDED)'
          },
          conflict_match_count: {
            type: 'number',
            minimum: 1,
            maximum: 200,
            default: 20,
            description: 'Maximum similar pair records to return from conflict detection'
          },
          conflict_scan_limit: {
            type: 'number',
            minimum: 50,
            maximum: 5000,
            default: 400,
            description: 'Maximum recent chunks scanned for conflict detection'
          },
          conflict_neighbor_limit: {
            type: 'number',
            minimum: 1,
            maximum: 20,
            default: 6,
            description: 'Nearest neighbors compared per chunk in conflict detection'
          },
          forget_candidate_days: {
            type: 'number',
            minimum: 3,
            maximum: 180,
            default: 14,
            description: 'Only suggest forget candidates older than this number of days'
          },
          forget_candidate_limit: {
            type: 'number',
            minimum: 1,
            maximum: 50,
            default: 10,
            description: 'Maximum forget candidates returned by health_check'
          }
        },
        additionalProperties: false
      }
    },
    {
      name: 'session_boot',
      description:
        `Initialize a new ${PROFILE.displayName} session by loading identity, workflow context, and recent status from long-term memory. Also runs an expiry-focused health snapshot and records a heartbeat sign-in. Call this once at the start of every new conversation to restore continuity and awareness of pending work.`,
      inputSchema: {
        type: 'object',
        properties: {
          source: { type: 'string', enum: PROFILE.sourceWhitelist, description: 'Source tool identifier (e.g. "warp", "cursor", "perplexity") for provenance tracking' },
          body_name: {
            type: 'string',
            description: 'Optional body/persona name (例如：大家姐、三哥、五妹、Toto)'
          },
          user_name: {
            type: 'string',
            description: 'Optional user/owner name for status recall (例如：Leo、Yvonne)'
          },
          topic: {
            type: 'string',
            description: 'Optional current focus topic for heartbeat'
          },
          mood: {
            type: 'string',
            description: 'Optional mood marker'
          },
          identity_query: {
            type: 'string',
            description: 'Optional override for identity recall query'
          },
          workflow_query: {
            type: 'string',
            description: 'Optional override for workflow recall query'
          },
          status_query: {
            type: 'string',
            description: 'Optional override for status recall query'
          },
          recall_limit: {
            type: 'number',
            minimum: 1,
            maximum: 10,
            default: 5,
            description: 'Maximum recall results per category (identity/workflow/status, default 5)'
          },
          alert_window_hours: {
            type: 'number',
            minimum: 1,
            maximum: 720,
            description: 'Optional override for expiry snapshot window (hours)'
          },
          gap_days: {
            type: 'number',
            minimum: 7,
            maximum: 365,
            description: 'Deprecated compatibility field; ignored by session_boot'
          },
          topic_limit: {
            type: 'number',
            minimum: 1,
            maximum: 20,
            description: 'Deprecated compatibility field; ignored by session_boot'
          }
        },
        required: ['source'],
        additionalProperties: false
      }
    },
    {
      name: 'session_close',
      description:
        `Save a ${PROFILE.displayName} session close summary before ending a conversation. The summary is stored as a short-term memory with 7-day retention, providing context for the next session boot. Include what was accomplished, what is still pending, and any important context for continuity.`,
      inputSchema: {
        type: 'object',
        properties: {
          source: { type: 'string', enum: PROFILE.sourceWhitelist },
          summary: {
            type: 'string',
            description: 'Session close summary'
          },
          topics: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional topic list'
          },
          mood: {
            type: 'string',
            description: 'Optional mood marker'
          }
        },
        required: ['source', 'summary'],
        additionalProperties: false
      }
    },
    {
      name: 'dream_ingest',
      description: `Ingest a Hermes digest (periodic summary report) into ${DB_PROFILE}.marsvault_chunks long-term memory. The content is automatically chunked into semantically meaningful segments and stored with vector embeddings for future recall. Use this for scheduled reports, daily digests, or any structured summary content that should be permanently available.`,
      inputSchema: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'The full text content of the digest to ingest. Will be automatically split into semantically coherent chunks.' },
          source_file: { type: 'string', description: 'Logical file path or identifier for the source of this digest (e.g. "hermes/daily/2026-06-10")' },
          section: { type: 'string', description: 'Optional section label prefix to tag all resulting chunks' },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Tags for categorization (e.g. ["digest", "daily", "report"])'
          },
          type: { type: 'string', description: 'Chunk type label', default: 'digest' },
          date: { type: 'string', description: 'Date for this digest in YYYY-MM-DD format. Defaults to today if omitted.' },
          body: { type: 'string', enum: PROFILE.recallBodyEnum, default: DB_PROFILE, description: 'Target persona profile for storage' },
          visibility: { type: 'string', enum: ['private', 'shared', 'global'], default: 'private', description: 'Access level: "private" = owner only, "shared" = cross-profile, "global" = system-wide' },
          origin: { type: 'string', description: 'Origin marker identifying where this content came from', default: PROFILE.digestDefaultOrigin },
          max_chunk_chars: { type: 'number', minimum: 300, maximum: 3000, default: 1200, description: 'Maximum character length per chunk (default 1200). Larger values = fewer, longer chunks.' }
        },
        required: ['content'],
        additionalProperties: false
      }
    },
    {
      name: PROFILE.memoryIngestToolName,
      description: `Promote content into permanent long-term memory (${DB_PROFILE}.marsvault_chunks). Automatically chunks the input text, generates vector embeddings, and stores each segment for semantic recall. Use this to preserve important insights, decisions, patterns, or knowledge that should survive beyond the current session. This is the primary path from ephemeral to permanent memory.`,
      inputSchema: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'The insight content to promote to long-term memory. Be specific and self-contained — future recall depends on the quality of this text.' },
          source_file: { type: 'string', description: 'Logical file path or identifier for the source (e.g. "sessions/2026-06-10-session-notes")' },
          section: { type: 'string', description: 'Optional section label prefix to organize chunks within the source' },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Categorization tags (e.g. ["decision", "architecture"])'
          },
          type: { type: 'string', description: 'Content type label (e.g. "insight", "observation", "decision")', default: 'insight' },
          date: { type: 'string', description: 'Date for this content in YYYY-MM-DD format. Defaults to today if omitted.' },
          visibility: { type: 'string', enum: ['private', 'shared', 'global'], default: 'private', description: 'Access level: "private" = this profile only, "shared" = cross-profile readable, "global" = system-wide' },
          origin: buildMemoryIngestOriginSchema(),
          source_memory_id: {
            type: 'string',
            description: 'Link this promotion to a specific short-term memory ID (for traceability)'
          },
          source_session_id: {
            type: 'string',
            description: 'Session ID where this insight originated (for provenance tracking)'
          },
          source_tool: {
            type: 'string',
            enum: PROFILE.sourceWhitelist,
            description: 'The tool/platform where this insight was originally captured'
          },
          source_user_note: {
            type: 'string',
            description: 'Brief note explaining why this memory was selected for promotion'
          },
          agent_body: {
            type: 'string',
            description: 'The persona/body this memory belongs to (e.g. "coco", "toto")'
          },
          environment: {
            type: 'string',
            description: 'Environment label (e.g. "production", "staging")'
          },
          max_chunk_chars: { type: 'number', minimum: 300, maximum: 3000, default: 1200, description: 'Maximum characters per chunk (default 1200). Adjust for finer or coarser granularity.' }
        },
        required: ['content'],
        additionalProperties: false
      }
    },
    {
      name: 'demote_memory',
      description: `Deprecate a long-term memory chunk in ${DB_PROFILE}.marsvault_chunks, marking it as outdated or superseded. The chunk is not deleted — it is flagged so it no longer appears in recall results. Use this when information becomes incorrect, irrelevant, or is replaced by newer knowledge. Optionally link to the replacement chunk for traceability.`,
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'UUID of the long-term memory chunk to deprecate' },
          deprecated_reason: { type: 'string', description: 'Why this memory is being deprecated (e.g. "superseded by newer architecture decision", "information confirmed incorrect")' },
          superseded_by: {
            type: 'string',
            description: 'UUID of the replacement chunk, if this memory is being superseded by updated content'
          },
          deprecated_at: {
            type: 'string',
            description: 'Custom deprecation timestamp in ISO 8601 format. Defaults to now if omitted.'
          }
        },
        required: ['id', 'deprecated_reason'],
        additionalProperties: false
      }
    },
    {
      name: 'soft_forget',
      description: `Expire short-term memories in ${DB_PROFILE}.memories early without permanently deleting them. Marked memories become invisible to search and list operations but remain in the database for audit purposes. Use this to clean up irrelevant or incorrect short-term memories before their natural expiration.`,
      inputSchema: {
        type: 'object',
        properties: {
          ids: {
            type: 'array',
            items: { type: 'string' },
            minItems: 1,
            maxItems: 50,
            description: 'Array of short-term memory UUIDs to expire. Up to 50 at a time.'
          },
          reason: {
            type: 'string',
            description: 'Brief explanation of why these memories are being forgotten (for audit trail)'
          },
          forgotten_at: {
            type: 'string',
            description: 'Custom expiration timestamp in ISO 8601 format. Defaults to now if omitted.'
          }
        },
        required: ['ids'],
        additionalProperties: false
      }
    },
    {
      name: 'explain_memory',
      description: `Trace the full provenance of a long-term memory chunk in ${DB_PROFILE}.marsvault_chunks — where it came from, how it was created, and what source material it was derived from. Returns the original source memory, session, tool, and timeline information. Use this to understand why a piece of knowledge exists or to verify its reliability.`,
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'UUID of the long-term memory chunk to explain' }
        },
        required: ['id'],
        additionalProperties: false
      }
    },
    {
      name: 'batch_promote',
      description: `Automatically promote expiring short-term memories from ${DB_PROFILE}.memories to permanent long-term storage (${DB_PROFILE}.marsvault_chunks). Scans for memories that will expire within the alert window, then chunks and ingests each one with vector embeddings. Use this to prevent valuable context from being lost when short-term memories expire. Supports dry-run mode to preview candidates before committing.`,
      inputSchema: {
        type: 'object',
        properties: {
          alert_window_hours: {
            type: 'number',
            minimum: 1,
            maximum: 720,
            default: 48,
            description: 'Look-ahead window in hours. Memories expiring within this window are candidates for promotion (default 48).'
          },
          max_promote: {
            type: 'number',
            minimum: 1,
            maximum: 50,
            default: 10,
            description: 'Maximum number of memories to promote in a single batch (default 10).'
          },
          dry_run: {
            type: 'boolean',
            default: false,
            description: 'When true, list candidate memories without actually promoting them. Use to preview before committing.'
          },
          memory_ids: {
            type: 'array',
            items: { type: 'string' },
            maxItems: 50,
            description: 'Explicit list of short-term memory UUIDs to promote. When provided, auto-detection is skipped and only these IDs are processed.'
          },
          origin: {
            type: 'string',
            description: 'Origin marker tagged on all promoted chunks for traceability',
            default: 'batch-promote'
          }
        },
        additionalProperties: false
      }
    }
  ];
}

const TOOLS = buildTools();
const TOOL_BY_NAME = new Map(TOOLS.map((tool) => [tool.name, tool]));

const OAUTH_CLIENTS = new Map();
const OAUTH_CODES = new Map();
const OAUTH_TOKENS = new Map();
const OAUTH_REFRESH_TOKENS = new Map();

function persistOauthClients() {
  if (!OAUTH_ENABLED) return;
  try {
    mkdirSync(dirname(OAUTH_CLIENTS_FILE), { recursive: true });
    writeFileSync(
      OAUTH_CLIENTS_FILE,
      JSON.stringify(Array.from(OAUTH_CLIENTS.values()), null, 2),
      'utf8'
    );
  } catch (error) {
    console.warn(
      `[oauth] failed to persist clients store: ${String(error?.message || error)}`
    );
  }
}

function loadPersistedOauthClients() {
  if (!OAUTH_ENABLED) return;
  try {
    if (!existsSync(OAUTH_CLIENTS_FILE)) return;
    const raw = readFileSync(OAUTH_CLIENTS_FILE, 'utf8').trim();
    if (!raw) return;
    const parsed = JSON.parse(raw);
    const clients = Array.isArray(parsed) ? parsed : parsed?.clients;
    if (!Array.isArray(clients)) return;
    for (const client of clients) {
      if (!client || typeof client.client_id !== 'string') continue;
      OAUTH_CLIENTS.set(client.client_id, client);
    }
    console.log(
      `[oauth] loaded ${OAUTH_CLIENTS.size} persisted clients from ${OAUTH_CLIENTS_FILE}`
    );
  } catch (error) {
    console.warn(
      `[oauth] failed to load clients store: ${String(error?.message || error)}`
    );
  }
}

function upsertOauthClient(client, options = {}) {
  OAUTH_CLIENTS.set(client.client_id, client);
  if (options.persist !== false) {
    persistOauthClients();
  }
  return client;
}

function randomId(prefix) {
  return `${prefix}_${crypto.randomBytes(20).toString('hex')}`;
}

function nowMs() {
  return Date.now();
}

function toBase64Url(buffer) {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function sha256Base64Url(input) {
  return toBase64Url(crypto.createHash('sha256').update(input).digest());
}
function extractServiceKeyFromDockerEnv(envOutput) {
  const lines = envOutput.split('\n');
  const keyPrefixesByPriority = [
    'SUPABASE_SERVICE_ROLE_KEY=',
    'SUPABASE_SERVICE_KEY=',
    'SERVICE_ROLE_KEY='
  ];
  for (const prefix of keyPrefixesByPriority) {
    const line = lines.find((entry) => entry.startsWith(prefix));
    if (line) {
      const rawValue = line.slice(prefix.length).trim();
      return rawValue
        .replace(/^"(.*)"$/, '$1')
        .replace(/^'(.*)'$/, '$1')
        .trim();
    }
  }
  return null;
}

function resolveKongContainerNames() {
  try {
    const output = execFileSync('docker', ['ps', '--format', '{{.Names}}'], {
      encoding: 'utf8'
    });
    const names = output
      .split('\n')
      .map((entry) => entry.trim())
      .filter(Boolean);
    const preferred = [
      'supabase-kong',
      'supabase_kong',
      ...names.filter((name) => name.startsWith('supabase-kong_')),
      ...names.filter((name) => name.startsWith('supabase_kong_')),
      ...names.filter((name) => /supabase[-_]kong/.test(name))
    ];
    return [...new Set(preferred)];
  } catch {
    return ['supabase-kong', 'supabase_kong'];
  }
}

function getServiceKey() {
  const keyFromEnv =
    String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim() ||
    String(process.env.SUPABASE_SERVICE_KEY || '').trim();
  if (keyFromEnv) {
    return keyFromEnv;
  }
  const containerNames = resolveKongContainerNames();
  for (const containerName of containerNames) {
    try {
      const envOutput = execFileSync(
        'docker',
        [
          'inspect',
          containerName,
          '--format',
          '{{range .Config.Env}}{{println .}}{{end}}'
        ],
        { encoding: 'utf8' }
      );
      const key = extractServiceKeyFromDockerEnv(envOutput);
      if (key) {
        return key;
      }
    } catch {
      // try next container candidate
    }
  }

  try {
    const statusOutput = execFileSync('supabase', ['status', '-o', 'env'], {
      encoding: 'utf8'
    });
    const keyFromStatus = extractServiceKeyFromDockerEnv(statusOutput);
    if (keyFromStatus) {
      return keyFromStatus;
    }
  } catch {
    // fallback exhausted; throw below
  }

  throw new Error(
    'Cannot resolve Supabase service key. Set SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY), or start Docker and ensure `supabase status -o env` works.'
  );
}

const SERVICE_KEY = SUPABASE_AUTH_MODE === 'anon' ? '' : getServiceKey();
if (
  (SUPABASE_AUTH_MODE === 'anon' || SUPABASE_AUTH_MODE === 'hybrid') &&
  !SUPABASE_ANON_KEY
) {
  throw new Error(
    'SUPABASE_ANON_KEY is required when MCP_SUPABASE_AUTH_MODE is anon or hybrid'
  );
}
loadPersistedOauthClients();

if (STATIC_CLIENT_ID && STATIC_CLIENT_SECRET && OAUTH_ENABLED) {
  upsertOauthClient(
    {
      client_id: STATIC_CLIENT_ID,
      client_secret: STATIC_CLIENT_SECRET,
      redirect_uris: [],
      scope: 'mcp',
      token_endpoint_auth_method: 'client_secret_post',
      created_at: Math.floor(nowMs() / 1000),
      static: true
    },
    { persist: false }
  );
}

function json(res, statusCode, payload, extraHeaders = {}) {
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    ...extraHeaders
  });
  res.end(JSON.stringify(payload));
}

function mcpResult(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function mcpError(id, code, message) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function readRequestBody(req) {
  const raw = (await readRawBody(req)).trim();
  if (!raw) return {};
  const contentType = String(req.headers['content-type'] || '').toLowerCase();
  if (contentType.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(raw));
  }
  if (contentType.includes('application/json') || raw.startsWith('{') || raw.startsWith('[')) {
    return JSON.parse(raw);
  }
  try {
    return JSON.parse(raw);
  } catch {
    return Object.fromEntries(new URLSearchParams(raw));
  }
}

function resolveSupabaseRequestAuthMode() {
  const storeMode = String(SUPABASE_REQUEST_CONTEXT.getStore()?.db_auth_mode || '')
    .trim()
    .toLowerCase();
  if (SUPABASE_AUTH_MODE_VALUES.has(storeMode)) {
    return storeMode;
  }
  if (SUPABASE_AUTH_MODE === 'anon') {
    return 'anon';
  }
  return 'service';
}

function isToolAllowedInAnonMode(toolName) {
  return ANON_ALLOWED_TOOL_NAMES.has(String(toolName || '').trim());
}

function assertToolCapabilityForAuthMode(toolName) {
  if (SUPABASE_AUTH_MODE !== 'anon') return;
  if (isToolAllowedInAnonMode(toolName)) return;
  throw new Error(
    `capability_not_available_in_anon_mode: ${toolName} is disabled; use MCP_SUPABASE_AUTH_MODE=service or hybrid`
  );
}

function resolveDbAuthModeForTool(toolName) {
  if (SUPABASE_AUTH_MODE === 'anon') return 'anon';
  if (SUPABASE_AUTH_MODE === 'service') return 'service';
  return isToolAllowedInAnonMode(toolName) ? 'anon' : 'service';
}
function listAvailableToolNamesForAuthMode(authMode) {
  if (authMode === 'anon') {
    return TOOLS
      .map((tool) => String(tool?.name || '').trim())
      .filter((name) => name && isToolAllowedInAnonMode(name));
  }
  return TOOLS.map((tool) => String(tool?.name || '').trim()).filter(Boolean);
}
function listAvailableToolsForAuthMode(authMode) {
  const names = listAvailableToolNamesForAuthMode(authMode);
  return names
    .map((name) => TOOL_BY_NAME.get(name))
    .filter((tool) => Boolean(tool));
}
function buildSupabaseCapabilityPayload() {
  return {
    mode: SUPABASE_AUTH_MODE,
    tool_surface: 'coco',
    prd_tools_enabled: false,
    anon_allowed_tools: listAvailableToolNamesForAuthMode('anon'),
    effective_tools: listAvailableToolNamesForAuthMode(SUPABASE_AUTH_MODE)
  };
}

async function supabaseRequest(path, options = {}) {
  const requestAuthMode = resolveSupabaseRequestAuthMode();
  const requestApiKey = requestAuthMode === 'anon' ? SUPABASE_ANON_KEY : SERVICE_KEY;
  if (!requestApiKey) {
    throw new Error(`Supabase API key missing for auth mode: ${requestAuthMode}`);
  }
  const headers = {
    apikey: requestApiKey,
    Authorization: `Bearer ${requestApiKey}`,
    'content-type': 'application/json'
  };
  if (options.profile) {
    headers['accept-profile'] = options.profile;
    headers['content-profile'] = options.profile;
  }
  if (options.prefer) {
    headers.prefer = options.prefer;
  }
  const response = await fetch(`${SUPABASE_BASE_URL}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const text = await response.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }

  if (!response.ok) {
    const detail =
      typeof parsed === 'string' ? parsed : JSON.stringify(parsed ?? {});
    throw new Error(`Supabase ${response.status}: ${detail}`);
  }

  return parsed;
}

function validateMemorySource(value, options = {}) {
  const required = options.required !== false;
  const source = String(value || '').trim();
  if (!source) {
    if (required) {
      throw new Error('source is required');
    }
    return '';
  }
  if (MEMORY_SOURCE_WHITELIST.has(source)) {
    return source;
  }
  if (SOURCE_MODE === 'registry') {
    if (!SOURCE_NAME_PATTERN.test(source)) {
      throw new Error('source must match ^[a-z][a-z0-9_-]{1,31}$');
    }
    throw new Error(
      `source '${source}' is disabled or not registered in ${DB_PROFILE}.${SOURCE_REGISTRY_TABLE}`
    );
  }
  throw new Error(MEMORY_SOURCE_VALIDATION_MESSAGE);
}

function buildSourceRegistryHealthPayload() {
  if (SOURCE_MODE !== 'registry') {
    return null;
  }
  return {
    loaded: SOURCE_REGISTRY_CACHE.loaded,
    loaded_at: SOURCE_REGISTRY_CACHE.loaded_at,
    enabled_count: SOURCE_REGISTRY_CACHE.enabled_sources.length,
    enabled_sources: SOURCE_REGISTRY_CACHE.enabled_sources.slice(),
    effective_sources: MEMORY_SOURCE_LIST.slice(),
    last_error: SOURCE_REGISTRY_CACHE.last_error || null
  };
}

async function reloadSourceRegistryCache(options = {}) {
  const manual = options.manual === true;
  if (SOURCE_MODE !== 'registry') {
    return {
      ok: true,
      mode: SOURCE_MODE,
      reloaded: false,
      manual,
      message: 'MCP_SOURCE_MODE is not registry; source_registry cache is bypassed',
      enabled_sources: [],
      effective_sources: MEMORY_SOURCE_LIST.slice()
    };
  }

  const query = new URLSearchParams();
  query.set('select', SOURCE_REGISTRY_SELECT_COLUMNS);
  query.set('enabled', 'eq.true');
  query.set('order', 'source.asc');

  try {
    const rows = await supabaseRequest(
      `/rest/v1/${SOURCE_REGISTRY_TABLE}?${query.toString()}`,
      { profile: DB_PROFILE }
    );
    const enabledSources = [];
    const seen = new Set();
    for (const row of Array.isArray(rows) ? rows : []) {
      const source = String(row?.source || '').trim();
      if (!source || !SOURCE_NAME_PATTERN.test(source)) continue;
      if (CORE_SOURCE_WHITELIST.has(source) || seen.has(source)) continue;
      seen.add(source);
      enabledSources.push(source);
    }
    SOURCE_REGISTRY_CACHE.loaded = true;
    SOURCE_REGISTRY_CACHE.loaded_at = new Date().toISOString();
    SOURCE_REGISTRY_CACHE.enabled_sources = enabledSources;
    SOURCE_REGISTRY_CACHE.last_error = '';
    setMemorySourceWhitelist(buildMemorySourceListForMode(enabledSources));
    return {
      ok: true,
      mode: SOURCE_MODE,
      reloaded: true,
      manual,
      loaded_at: SOURCE_REGISTRY_CACHE.loaded_at,
      enabled_sources: enabledSources,
      effective_sources: MEMORY_SOURCE_LIST.slice()
    };
  } catch (error) {
    const errorMessage = String(error?.message || error);
    SOURCE_REGISTRY_CACHE.loaded = false;
    SOURCE_REGISTRY_CACHE.last_error = normalizeOptionalText(errorMessage, 280);
    if (!SOURCE_REGISTRY_CACHE.loaded_at) {
      SOURCE_REGISTRY_CACHE.enabled_sources = [];
      setMemorySourceWhitelist(buildMemorySourceListForMode([]));
    }
    return {
      ok: false,
      mode: SOURCE_MODE,
      reloaded: false,
      manual,
      loaded_at: SOURCE_REGISTRY_CACHE.loaded_at,
      enabled_sources: SOURCE_REGISTRY_CACHE.enabled_sources.slice(),
      effective_sources: MEMORY_SOURCE_LIST.slice(),
      error: errorMessage
    };
  }
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  return tags
    .map((tag) => String(tag).trim())
    .filter(Boolean)
    .slice(0, 30);
}

function normalizeChunkVisibility(value) {
  const normalized = String(value || 'private')
    .trim()
    .toLowerCase();
  if (!CHUNK_VISIBILITY_WHITELIST.has(normalized)) {
    throw new Error('visibility must be one of private/shared/global');
  }
  return normalized;
}

function normalizeChunkBody(value) {
  const normalized = String(value || DB_PROFILE)
    .trim()
    .toLowerCase();
  if (!CHUNK_BODY_WHITELIST.has(normalized)) {
    throw new Error('body must be one of coco/toto/system');
  }
  return normalized;
}

function normalizeChunkDate(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return new Date().toISOString().slice(0, 10);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new Error('date must be YYYY-MM-DD');
  }
  return raw;
}
function normalizeOptionalUuid(value, fieldName = 'uuid') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw)
  ) {
    throw new Error(`${fieldName} must be a valid UUID`);
  }
  return raw.toLowerCase();
}

function splitDigestContent(rawContent, maxChunkChars = 1200) {
  const text = String(rawContent || '').trim();
  if (!text) return [];

  const capRaw = Number(maxChunkChars);
  const cap = Number.isFinite(capRaw) ? Math.max(300, Math.min(3000, Math.trunc(capRaw))) : 1200;
  const paragraphs = text
    .split(/\n{2,}/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) return [];

  const chunks = [];
  let current = '';

  const flushCurrent = () => {
    const chunk = current.trim();
    if (chunk) chunks.push(chunk);
    current = '';
  };

  for (const paragraph of paragraphs) {
    if (paragraph.length > cap) {
      flushCurrent();
      for (let i = 0; i < paragraph.length; i += cap) {
        const piece = paragraph.slice(i, i + cap).trim();
        if (piece) chunks.push(piece);
      }
      continue;
    }

    if (!current) {
      current = paragraph;
      continue;
    }

    const merged = `${current}\n\n${paragraph}`;
    if (merged.length <= cap) {
      current = merged;
    } else {
      flushCurrent();
      current = paragraph;
    }
  }
  flushCurrent();
  return chunks;
}

function clampInteger(value, min, max, fallback) {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(raw)));
}

function parseTimestamp(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
function normalizeOptionalIsoTimestamp(value, fieldName = 'timestamp') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const parsed = parseTimestamp(raw);
  if (!parsed) {
    throw new Error(`${fieldName} must be a valid ISO timestamp`);
  }
  return parsed.toISOString();
}

function toUtcStartOfDay(date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
}

function parseDateOnly(value) {
  const timestamp = parseTimestamp(value);
  if (!timestamp) return null;
  return toUtcStartOfDay(timestamp);
}

function formatDateOnly(date) {
  return date.toISOString().slice(0, 10);
}

function diffDaysUtc(fromDate, toDate) {
  const ms = toDate.getTime() - fromDate.getTime();
  return Math.floor(ms / 86400000);
}

function normalizeTopicTag(tag) {
  return String(tag || '').trim().toLowerCase();
}

function collectTagCounts(rows) {
  const counts = new Map();
  for (const row of rows) {
    for (const tag of normalizeTags(row?.tags)) {
      const normalized = normalizeTopicTag(tag);
      if (!normalized) continue;
      counts.set(normalized, (counts.get(normalized) || 0) + 1);
    }
  }
  return counts;
}

function sortTagEntries(tagMap) {
  return Array.from(tagMap.entries()).sort(
    (left, right) => right[1] - left[1] || left[0].localeCompare(right[0])
  );
}

function normalizeDailySource(value) {
  const source = String(value || '').trim();
  if (!CORE_SOURCE_WHITELIST.has(source)) {
    throw new Error(CORE_SOURCE_VALIDATION_MESSAGE);
  }
  return source;
}

function normalizeOptionalText(value, maxLength = 200) {
  if (value === undefined || value === null) return '';
  const text = String(value).trim();
  if (!text) return '';
  return text.slice(0, Math.max(1, maxLength));
}
function normalizeOptionalSourceTool(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  if (!CORE_SOURCE_WHITELIST.has(normalized)) {
    throw new Error(CORE_SOURCE_VALIDATION_MESSAGE);
  }
  return normalized;
}
function normalizeOptionalAgentBody(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-');
  if (!normalized) return '';
  return normalized.slice(0, 80);
}
function normalizeOptionalEnvironment(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-');
  if (!normalized) return '';
  return normalized.slice(0, 80);
}
function normalizeMemoryScope(value) {
  const normalized = String(value || 'this_body')
    .trim()
    .toLowerCase();
  if (!MEMORY_SCOPE_VALUES.has(normalized)) {
    throw new Error('scope must be one of this_body/all_bodies');
  }
  return normalized;
}
function inferAgentBodyFromSource(source) {
  const normalizedSource = String(source || '')
    .trim()
    .toLowerCase();
  if (!normalizedSource) return '';
  return SOURCE_TO_AGENT_BODY_MAP.get(normalizedSource) || normalizedSource;
}
function inferAgentBodyFromOrigin(origin) {
  const normalizedOrigin = String(origin || '')
    .trim()
    .toLowerCase();
  if (!normalizedOrigin) return '';
  const [originPrefix] = normalizedOrigin.split('-', 1);
  return inferAgentBodyFromSource(originPrefix);
}
function resolveWriteAgentBody(args = {}) {
  const explicit = normalizeOptionalAgentBody(args.agent_body);
  if (explicit) return explicit;
  const fromSourceTool = inferAgentBodyFromSource(args.source_tool);
  if (fromSourceTool) return fromSourceTool;
  const fromSource = inferAgentBodyFromSource(args.source);
  if (fromSource) return fromSource;
  const fromOrigin = inferAgentBodyFromOrigin(args.origin);
  if (fromOrigin) return fromOrigin;
  const fromDefault = normalizeOptionalAgentBody(DEFAULT_AGENT_BODY);
  if (fromDefault) return fromDefault;
  return DB_PROFILE;
}
function resolveWriteEnvironment(args = {}) {
  const explicit = normalizeOptionalEnvironment(args.environment);
  if (explicit) return explicit;
  const fromDefault = normalizeOptionalEnvironment(DEFAULT_ENVIRONMENT);
  if (fromDefault) return fromDefault;
  return 'desktop';
}
function resolveScopeFilters(args = {}, fallbackAgentBody = '') {
  const requestedScope = normalizeMemoryScope(args.scope);
  const explicitAgentBody = normalizeOptionalAgentBody(args.agent_body);
  const fallbackBody = normalizeOptionalAgentBody(fallbackAgentBody);
  const defaultBody = normalizeOptionalAgentBody(DEFAULT_AGENT_BODY);
  const agentBody = explicitAgentBody || fallbackBody || defaultBody || '';
  const explicitEnvironment = normalizeOptionalEnvironment(args.environment);
  const defaultEnvironment = normalizeOptionalEnvironment(DEFAULT_ENVIRONMENT);
  const environment = explicitEnvironment || defaultEnvironment || '';
  const effectiveScope =
    requestedScope === 'this_body' && !agentBody ? 'all_bodies' : requestedScope;
  return {
    requested_scope: requestedScope,
    scope: effectiveScope,
    agent_body: agentBody || null,
    environment: environment || null,
    fallback_to_all_bodies: requestedScope === 'this_body' && effectiveScope === 'all_bodies'
  };
}
function normalizeMemoryTagsWithContext(tags, agentBody, environment) {
  return normalizeTags([
    agentBody ? `agent_body:${agentBody}` : '',
    environment ? `environment:${environment}` : '',
    ...(Array.isArray(tags) ? tags : []),
  ]);
}
function appendTokenCharCount(value, state) {
  if (state.totalChars >= TOOL_USAGE_TOKEN_CHAR_CAP) return;
  if (value === undefined || value === null) return;
  if (Array.isArray(value)) {
    for (const item of value) {
      appendTokenCharCount(item, state);
      if (state.totalChars >= TOOL_USAGE_TOKEN_CHAR_CAP) break;
    }
    return;
  }
  let chunk = '';
  if (typeof value === 'object') {
    try {
      chunk = JSON.stringify(value);
    } catch {
      chunk = '';
    }
  } else {
    chunk = String(value);
  }
  if (!chunk) return;
  state.totalChars = Math.min(
    TOOL_USAGE_TOKEN_CHAR_CAP,
    state.totalChars + chunk.length
  );
}
function estimateToolUsageTokens(toolName, args = {}) {
  const normalizedToolName = String(toolName || '')
    .trim()
    .toLowerCase();
  const safeArgs = args && typeof args === 'object' ? args : {};
  const state = { totalChars: 0 };
  switch (normalizedToolName) {
    case 'insert_memory':
      appendTokenCharCount(safeArgs.body, state);
      appendTokenCharCount(safeArgs.tags, state);
      break;
    case 'search_memories':
    case 'recall':
      appendTokenCharCount(safeArgs.query, state);
      appendTokenCharCount(safeArgs.type, state);
      break;
    case 'session_close':
      appendTokenCharCount(safeArgs.summary, state);
      appendTokenCharCount(safeArgs.topics, state);
      appendTokenCharCount(safeArgs.mood, state);
      break;
    case 'session_boot':
      appendTokenCharCount(safeArgs.topic, state);
      appendTokenCharCount(safeArgs.mood, state);
      appendTokenCharCount(safeArgs.identity_query, state);
      appendTokenCharCount(safeArgs.workflow_query, state);
      appendTokenCharCount(safeArgs.status_query, state);
      break;
    case 'demote_memory':
      appendTokenCharCount(safeArgs.deprecated_reason, state);
      break;
    case 'soft_forget':
      appendTokenCharCount(safeArgs.reason, state);
      break;
    default:
      if (TOOL_USAGE_INGEST_NAMES.has(normalizedToolName)) {
        appendTokenCharCount(safeArgs.content, state);
        appendTokenCharCount(safeArgs.section, state);
        appendTokenCharCount(safeArgs.source_file, state);
        appendTokenCharCount(safeArgs.source_user_note, state);
      } else {
        appendTokenCharCount(safeArgs, state);
      }
      break;
  }
  return Math.max(0, Math.round(state.totalChars / 4));
}
function resolveToolUsageAgentBody(toolName, args = {}) {
  const safeArgs = args && typeof args === 'object' ? args : {};
  const explicit = normalizeOptionalAgentBody(safeArgs.agent_body);
  if (explicit) return explicit;
  if (toolName === 'recall') {
    const recallBody = normalizeOptionalAgentBody(safeArgs.body);
    if (recallBody) return recallBody;
  }
  const fromSource = inferAgentBodyFromSource(safeArgs.source);
  if (fromSource) return fromSource;
  const fromOrigin = inferAgentBodyFromOrigin(safeArgs.origin);
  if (fromOrigin) return fromOrigin;
  const fromDefault = normalizeOptionalAgentBody(DEFAULT_AGENT_BODY);
  if (fromDefault) return fromDefault;
  return DB_PROFILE;
}
async function writeToolUsageTelemetry(payload = {}) {
  const toolName = String(payload.tool_name || '')
    .trim()
    .toLowerCase();
  if (!toolName) return;
  const latencyMsRaw = Number(payload.latency_ms);
  const latencyMs =
    Number.isFinite(latencyMsRaw) && latencyMsRaw >= 0
      ? Math.trunc(latencyMsRaw)
      : 0;
  const tokensEstimateRaw = Number(payload.tokens_estimate);
  const tokensEstimate =
    Number.isFinite(tokensEstimateRaw) && tokensEstimateRaw >= 0
      ? Math.trunc(tokensEstimateRaw)
      : 0;
  const timestamp =
    normalizeOptionalIsoTimestamp(payload.timestamp, 'timestamp') ||
    new Date().toISOString();
  const agentBody =
    normalizeOptionalAgentBody(payload.agent_body) || DB_PROFILE;
  if (SUPABASE_AUTH_MODE === 'anon') {
    return;
  }
  const writeTelemetry = async () => {
    await supabaseRequest(
      `/rest/v1/memory_tool_usage?select=${TOOL_USAGE_INSERT_SELECT_COLUMNS}`,
      {
        method: 'POST',
        profile: DB_PROFILE,
        prefer: 'return=minimal',
        body: [
          {
            tool_name: toolName,
            timestamp,
            latency_ms: latencyMs,
            tokens_estimate: tokensEstimate,
            agent_body: agentBody
          }
        ]
      }
    );
  };
  try {
    if (SUPABASE_AUTH_MODE === 'hybrid') {
      await SUPABASE_REQUEST_CONTEXT.run({ db_auth_mode: 'service' }, writeTelemetry);
    } else {
      await writeTelemetry();
    }
  } catch (error) {
    console.warn(
      `[telemetry] failed to persist memory_tool_usage: ${String(error?.message || error)}`
    );
  }
}

function normalizeDailyTopics(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => normalizeOptionalText(item, 60))
    .filter(Boolean)
    .slice(0, 20);
}

function dailyDateKey(date = new Date()) {
  return formatDateOnly(toUtcStartOfDay(date));
}
async function fetchToolUsageDailySummary(dateKey) {
  const normalizedDate = normalizeChunkDate(dateKey);
  try {
    const result = await supabaseRequest('/rest/v1/rpc/memory_tool_usage_daily_summary', {
      method: 'POST',
      profile: DB_PROFILE,
      body: {
        p_date: normalizedDate
      }
    });
    const row = Array.isArray(result) ? result[0] : null;
    return {
      status: 'ok',
      date: normalizedDate,
      recall_count: Math.max(0, Number(row?.recall_count) || 0),
      insert_count: Math.max(0, Number(row?.insert_count) || 0),
      ingest_count: Math.max(0, Number(row?.ingest_count) || 0),
      total_count: Math.max(0, Number(row?.total_count) || 0)
    };
  } catch (error) {
    return {
      status: 'unavailable',
      date: normalizedDate,
      recall_count: 0,
      insert_count: 0,
      ingest_count: 0,
      total_count: 0,
      message: normalizeOptionalText(error?.message || String(error), 280)
    };
  }
}

function buildLifecycleSessionId(kind, source, dateKey) {
  return `${kind}:${source}:${dateKey}`;
}

function parseJsonObject(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function isSessionCloseSessionId(sessionId) {
  const normalized = String(sessionId || '').trim().toLowerCase();
  return (
    normalized.startsWith('session_close:') ||
    normalized.startsWith('daily_close:')
  );
}

function extractSessionCloseSnapshot(memory) {
  const sessionId = String(memory?.session_id || '').trim();
  const payload = parseJsonObject(memory?.body) || {};
  const payloadType = normalizeOptionalText(payload.type, 80).toLowerCase();
  const isCloseType =
    payloadType === 'session_close' ||
    payloadType === 'session_close_auto_recovery' ||
    payloadType === 'daily_close';
  const isCloseRecord = isCloseType || isSessionCloseSessionId(sessionId);
  if (!isCloseRecord) return null;

  const summaryText =
    normalizeOptionalText(payload.summary, 1000) ||
    normalizeOptionalText(memory?.body, 240);

  return {
    id: memory?.id || null,
    source: memory?.source || null,
    session_id: sessionId || null,
    date: normalizeOptionalText(payload.date, 20) || null,
    summary: summaryText || null,
    topics: normalizeDailyTopics(payload.topics),
    mood: normalizeOptionalText(payload.mood, 80) || null,
    created_at: memory?.created_at || null,
    close_type: payloadType || 'session_close'
  };
}

async function fetchLatestSessionCloseSnapshot(source) {
  const loadRecentRows = async (sourceFilter, limit) => {
    const query = new URLSearchParams();
    query.set('select', MEMORY_SELECT_COLUMNS);
    query.set('order', 'created_at.desc');
    query.set('limit', String(limit));
    if (sourceFilter) {
      query.set('source', `eq.${sourceFilter}`);
    }
    const rows = await supabaseRequest(`/rest/v1/memories?${query.toString()}`, {
      profile: DB_PROFILE
    });
    return Array.isArray(rows) ? rows : [];
  };

  const sourceScopedRows = await loadRecentRows(source, 80);
  for (const row of sourceScopedRows) {
    const snapshot = extractSessionCloseSnapshot(row);
    if (snapshot) return snapshot;
  }

  const crossSourceRows = await loadRecentRows('', 120);
  for (const row of crossSourceRows) {
    const snapshot = extractSessionCloseSnapshot(row);
    if (snapshot) return snapshot;
  }

  return null;
}

function buildDailyBootQueries(args = {}) {
  const defaults = DAILY_BOOT_QUERY_DEFAULTS[DB_PROFILE] || DAILY_BOOT_QUERY_DEFAULTS.coco;
  const agentName =
    normalizeOptionalText(args.agent_name || args.body_name, 80) || defaults.workflow_subject;
  const userName = normalizeOptionalText(args.user_name, 80);
  const identityQuery =
    normalizeOptionalText(args.identity_query, 300) || defaults.identity_query;
  const workflowQuery =
    normalizeOptionalText(args.workflow_query, 300) ||
    `${agentName} workflow 符號 操作姿勢`;
  const statusQuery =
    normalizeOptionalText(args.status_query, 300) ||
    (userName
      ? `${userName} ${DAILY_BOOT_STATUS_QUERY_SUFFIX}`
      : DAILY_BOOT_STATUS_QUERY_SUFFIX);
  const recallLimit = clampInteger(args.recall_limit, 1, 10, 5);

  return {
    agent_name: agentName,
    user_name: userName,
    identity_query: identityQuery,
    workflow_query: workflowQuery,
    status_query: statusQuery,
    recall_limit: recallLimit
  };
}

function summarizeRecallStep(result) {
  const items = Array.isArray(result?.items) ? result.items : [];
  const countRaw = Number(result?.count);
  const count = Number.isFinite(countRaw) ? countRaw : items.length;
  const topMatches = items.slice(0, 3).map((item) => ({
    source_file: item?.source_file || null,
    section: item?.section || null,
    similarity: Number.isFinite(Number(item?.similarity))
      ? Number(item.similarity)
      : null,
    excerpt: normalizeOptionalText(item?.content || '', 160)
  }));
  return {
    count,
    top_matches: topMatches
  };
}
function tokenizeRecallText(text, options = {}) {
  const raw = String(text || '').trim();
  if (!raw) return [];
  const maxTokens = clampInteger(options.max_tokens, 5, 80, 40);
  const maxHanNgram = clampInteger(options.max_han_ngram, 2, 4, 3);
  const tokenSet = new Set();

  const latinTokens = raw.toLowerCase().match(/[a-z0-9][a-z0-9_-]{1,}/g) || [];
  for (const token of latinTokens) {
    tokenSet.add(token);
    if (tokenSet.size >= maxTokens) {
      return Array.from(tokenSet).slice(0, maxTokens);
    }
  }

  const hanGroups = raw.match(/\p{Script=Han}+/gu) || [];
  for (const group of hanGroups) {
    const chars = Array.from(group);
    if (chars.length < 2) continue;
    const maxGramSize = Math.min(chars.length, maxHanNgram);
    for (let gramSize = maxGramSize; gramSize >= 2; gramSize -= 1) {
      for (let index = 0; index <= chars.length - gramSize; index += 1) {
        tokenSet.add(chars.slice(index, index + gramSize).join(''));
        if (tokenSet.size >= maxTokens) {
          return Array.from(tokenSet).slice(0, maxTokens);
        }
      }
    }
  }

  return Array.from(tokenSet).slice(0, maxTokens);
}
function findRecallTokenIndex(text, token) {
  const content = String(text || '');
  const keyword = String(token || '');
  if (!content || !keyword) return -1;
  if (/^[a-z0-9_-]+$/i.test(keyword)) {
    return content.toLowerCase().indexOf(keyword.toLowerCase());
  }
  return content.indexOf(keyword);
}
function buildRecallMatchedSpans(content, overlapTokens, options = {}) {
  const text = String(content || '');
  if (!text) return [];
  const maxSpans = clampInteger(options.max_spans, 1, 8, 3);
  const contextRadius = clampInteger(options.context_radius, 10, 120, 24);
  const spans = [];
  const seen = new Set();

  for (const token of Array.isArray(overlapTokens) ? overlapTokens : []) {
    if (spans.length >= maxSpans) break;
    const index = findRecallTokenIndex(text, token);
    if (index < 0) continue;
    const start = Math.max(0, index - contextRadius);
    const end = Math.min(text.length, index + String(token).length + contextRadius);
    const segment = text.slice(start, end).replace(/\s+/g, ' ').trim();
    if (!segment) continue;
    const span = `${start > 0 ? '…' : ''}${segment}${end < text.length ? '…' : ''}`;
    const dedupeKey = `${token}::${span}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    spans.push({
      keyword: token,
      span
    });
  }

  return spans;
}
function buildRecallTimeHint(item, nowTs = new Date()) {
  const dateText = normalizeOptionalText(item?.date, 20);
  const referenceTs = parseTimestamp(
    dateText ? `${dateText}T00:00:00.000Z` : item?.created_at
  );
  if (!referenceTs) return '';
  const deltaDays = Math.abs(
    diffDaysUtc(toUtcStartOfDay(referenceTs), toUtcStartOfDay(nowTs))
  );
  if (deltaDays <= 14) {
    return `時間接近近期（約 ${deltaDays} 日內）`;
  }
  const normalizedDate = dateText || referenceTs.toISOString().slice(0, 10);
  return `記錄時間 ${normalizedDate}`;
}
function buildRecallExplainSentence(item, overlapTokens, options = {}) {
  const reasons = [];
  if (overlapTokens.length === 1) {
    reasons.push(`命中關鍵詞「${overlapTokens[0]}」`);
  } else if (overlapTokens.length > 1) {
    reasons.push(`同時命中關鍵詞「${overlapTokens.slice(0, 3).join('、')}」`);
  }
  const similarity = Number(item?.similarity);
  if (Number.isFinite(similarity)) {
    reasons.push(`語義相似度 ${(similarity * 100).toFixed(1)}%`);
  }
  const timeHint = buildRecallTimeHint(item, options.now || new Date());
  if (timeHint) {
    reasons.push(timeHint);
  }
  if (reasons.length === 0) {
    return '主要由語義向量相近命中。';
  }
  return `因為${reasons.join('，')}。`;
}
function explainRecall(queryText, results = [], options = {}) {
  const debugExplain = options.debug_explain === true;
  const queryTokens = tokenizeRecallText(queryText, {
    max_tokens: 40,
    max_han_ngram: 3
  });
  const nowTs = parseTimestamp(options.now) || new Date();
  const items = Array.isArray(results) ? results : [];
  const explainedItems = items.map((item) => {
    const hitTokens = tokenizeRecallText(item?.content || '', {
      max_tokens: 60,
      max_han_ngram: 3
    });
    const hitTokenSet = new Set(hitTokens);
    const overlapTokens = queryTokens
      .filter((token) => hitTokenSet.has(token))
      .slice(0, 8);
    const matchedSpans = buildRecallMatchedSpans(item?.content || '', overlapTokens, {
      max_spans: 3,
      context_radius: 24
    });
    const recallExplain = buildRecallExplainSentence(item, overlapTokens, {
      now: nowTs
    });
    return {
      ...item,
      keywords_overlap: overlapTokens,
      matched_spans: matchedSpans,
      recall_explain: recallExplain,
      ...(debugExplain
        ? {
            debug_explain: {
              query_tokens: queryTokens,
              hit_tokens: hitTokens,
              overlap_tokens: overlapTokens
            }
          }
        : {})
    };
  });

  return {
    query_tokens: queryTokens,
    items: explainedItems
  };
}

function summarizeHealthStep(result) {
  return {
    total_chunks: Number(result?.count_chunks?.total_chunks || 0),
    soon_expiring_count: Number(result?.expiry_alert?.soon_expiring_count || 0),
    recommended_for_promotion_count: Number(
      result?.expiry_alert?.recommended_for_promotion_count || 0
    ),
    narrative: normalizeOptionalText(result?.narrative || '', 1200)
  };
}
function summarizeSessionBootHealthStep(result) {
  return {
    mode: 'expiry_only',
    alert_window_hours: Number(result?.expiry_alert?.alert_window_hours || 0),
    soon_expiring_count: Number(result?.expiry_alert?.soon_expiring_count || 0),
    recommended_for_promotion_count: Number(
      result?.expiry_alert?.recommended_for_promotion_count || 0
    ),
    narrative: normalizeOptionalText(result?.narrative || '', 600)
  };
}

function buildLifecycleMemoryTags(baseTags, source, dateKey, extraTags = []) {
  return normalizeTags([
    ...baseTags,
    `source:${source}`,
    `date:${dateKey}`,
    `profile:${DB_PROFILE}`,
    ...extraTags
  ]);
}

async function fetchMemoryBySessionId(sessionId, source) {
  const query = new URLSearchParams();
  query.set('select', MEMORY_SELECT_COLUMNS);
  query.set('source', `eq.${source}`);
  query.set('session_id', `eq.${sessionId}`);
  query.set('order', 'created_at.desc');
  query.set('limit', '1');
  const rows = await supabaseRequest(`/rest/v1/memories?${query.toString()}`, {
    profile: DB_PROFILE
  });
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}
async function fetchMemoryById(memoryId) {
  const query = new URLSearchParams();
  query.set('select', MEMORY_SELECT_COLUMNS);
  query.set('id', `eq.${memoryId}`);
  query.set('limit', '1');
  const rows = await supabaseRequest(`/rest/v1/memories?${query.toString()}`, {
    profile: DB_PROFILE
  });
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}
async function fetchLatestMemoryBySession(sessionId, source = '') {
  const query = new URLSearchParams();
  query.set('select', MEMORY_SELECT_COLUMNS);
  query.set('session_id', `eq.${sessionId}`);
  if (source) {
    query.set('source', `eq.${source}`);
  }
  query.set('order', 'created_at.desc');
  query.set('limit', '1');
  const rows = await supabaseRequest(`/rest/v1/memories?${query.toString()}`, {
    profile: DB_PROFILE
  });
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}
async function fetchChunkById(chunkId) {
  const query = new URLSearchParams();
  query.set(
    'select',
    'id,content,source_file,section,body,visibility,tags,type,date,origin,source_memory_id,source_session_id,source_tool,source_user_note,agent_body,environment,created_at,updated_at'
  );
  query.set('id', `eq.${chunkId}`);
  query.set('limit', '1');
  const rows = await supabaseRequest(`/rest/v1/marsvault_chunks?${query.toString()}`, {
    profile: DB_PROFILE
  });
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}
async function markMemoryAsPromoted(memoryId) {
  const query = new URLSearchParams();
  query.set('id', `eq.${memoryId}`);
  query.set('select', 'id,promoted,promoted_at');
  const promotedAt = new Date().toISOString();
  const rows = await supabaseRequest(`/rest/v1/memories?${query.toString()}`, {
    method: 'PATCH',
    profile: DB_PROFILE,
    prefer: 'return=representation',
    body: {
      promoted: true,
      promoted_at: promotedAt
    }
  });
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

async function upsertMemoryBySession({
  session_id,
  source,
  body,
  tags,
  expires_at,
  existing,
  agent_body,
  environment
}) {
  const resolvedAgentBody =
    normalizeOptionalAgentBody(agent_body) || resolveWriteAgentBody({ source });
  const resolvedEnvironment =
    normalizeOptionalEnvironment(environment) || resolveWriteEnvironment({ environment });
  const payload = {
    body,
    source,
    session_id,
    tags: normalizeMemoryTagsWithContext(tags, resolvedAgentBody, resolvedEnvironment),
    agent_body: resolvedAgentBody,
    environment: resolvedEnvironment
  };
  if (expires_at) {
    payload.expires_at = expires_at;
  }

  if (existing?.id) {
    const query = new URLSearchParams();
    query.set('id', `eq.${existing.id}`);
    query.set('select', MEMORY_SELECT_COLUMNS);
    const patched = await supabaseRequest(`/rest/v1/memories?${query.toString()}`, {
      method: 'PATCH',
      profile: DB_PROFILE,
      prefer: 'return=representation',
      body: payload
    });
    return Array.isArray(patched) && patched.length > 0 ? patched[0] : existing;
  }

  const createdId = crypto.randomUUID();
  const inserted = await supabaseRequest(`/rest/v1/memories?select=${MEMORY_SELECT_COLUMNS}`, {
    method: 'POST',
    profile: DB_PROFILE,
    prefer: 'return=representation',
    body: [{ id: createdId, ...payload }]
  });
  if (Array.isArray(inserted) && inserted.length > 0) {
    return inserted[0];
  }
  const fetched = await fetchMemoryBySessionId(session_id, source);
  return fetched || null;
}

async function ensureDailyCloseRecovery(source, nowTs) {
  const yesterdayDate = new Date(toUtcStartOfDay(nowTs).getTime() - 86400000);
  const yesterdayDateKey = formatDateOnly(yesterdayDate);
  const yesterdayBootSessionId = buildLifecycleSessionId(
    'session_boot',
    source,
    yesterdayDateKey
  );
  let yesterdayBoot = await fetchMemoryBySessionId(yesterdayBootSessionId, source);
  if (!yesterdayBoot) {
    const legacyYesterdayBootSessionId = buildLifecycleSessionId(
      'daily_boot',
      source,
      yesterdayDateKey
    );
    yesterdayBoot = await fetchMemoryBySessionId(legacyYesterdayBootSessionId, source);
  }
  if (!yesterdayBoot) {
    return {
      checked_date: yesterdayDateKey,
      needed: false,
      inserted: false,
      reason: 'no_yesterday_boot'
    };
  }
  const closeSessionId = buildLifecycleSessionId('session_close', source, yesterdayDateKey);
  let yesterdayClose = await fetchMemoryBySessionId(closeSessionId, source);
  if (!yesterdayClose) {
    const legacyCloseSessionId = buildLifecycleSessionId('daily_close', source, yesterdayDateKey);
    yesterdayClose = await fetchMemoryBySessionId(legacyCloseSessionId, source);
  }
  if (yesterdayClose) {
    return {
      checked_date: yesterdayDateKey,
      needed: false,
      inserted: false
    };
  }

  const recoverySessionId = `session_close:auto:${source}:${yesterdayDateKey}`;
  let existingRecovery = await fetchMemoryBySessionId(recoverySessionId, source);
  if (!existingRecovery) {
    const legacyRecoverySessionId = `daily_close:auto:${source}:${yesterdayDateKey}`;
    existingRecovery = await fetchMemoryBySessionId(legacyRecoverySessionId, source);
  }
  if (existingRecovery) {
    return {
      checked_date: yesterdayDateKey,
      needed: true,
      inserted: false,
      recovery_id: existingRecovery.id
    };
  }

  const summaryText = `[auto] 昨日 ${yesterdayDateKey} 冇 session_close，今日 boot 時補記`;
  const recoveryPayload = {
    type: 'session_close_auto_recovery',
    profile: DB_PROFILE,
    source,
    date: yesterdayDateKey,
    summary: summaryText,
    created_at: nowTs.toISOString()
  };
  const tags = buildLifecycleMemoryTags(
    ['session_close', 'auto-補救'],
    source,
    yesterdayDateKey
  );
  const expiresAt = new Date(nowTs.getTime() + 7 * 24 * 3600000).toISOString();
  const inserted = await upsertMemoryBySession({
    session_id: recoverySessionId,
    source,
    body: JSON.stringify(recoveryPayload),
    tags,
    expires_at: expiresAt,
    existing: null
  });

  return {
    checked_date: yesterdayDateKey,
    needed: true,
    inserted: true,
    recovery_id: inserted?.id || null,
    summary: summaryText
  };
}

async function runDailyBoot(args = {}) {
  const source = normalizeDailySource(args.source);
  const topic = normalizeOptionalText(args.topic, 200);
  const mood = normalizeOptionalText(args.mood, 80);
  const queries = buildDailyBootQueries(args);
  const inferredSourceAgentBody = inferAgentBodyFromSource(source);
  const recallScopeArgs = {
    scope: 'this_body',
    ...(inferredSourceAgentBody ? { agent_body: inferredSourceAgentBody } : {})
  };
  const nowTs = new Date();
  const dateKey = dailyDateKey(nowTs);
  const heartbeatSessionId = buildLifecycleSessionId('session_boot', source, dateKey);
  let existingHeartbeat = await fetchMemoryBySessionId(heartbeatSessionId, source);
  if (!existingHeartbeat) {
    const legacyHeartbeatSessionId = buildLifecycleSessionId('daily_boot', source, dateKey);
    existingHeartbeat = await fetchMemoryBySessionId(legacyHeartbeatSessionId, source);
  }
  const heartbeatTags = buildLifecycleMemoryTags(['heartbeat', 'session_boot'], source, dateKey);
  const heartbeatExpiry = new Date(nowTs.getTime() + 24 * 3600000).toISOString();

  const soulRecall = await callTool('recall', {
    query: queries.identity_query,
    limit: queries.recall_limit,
    ...recallScopeArgs
  });
  const workflowRecall = await callTool('recall', {
    query: queries.workflow_query,
    limit: queries.recall_limit,
    ...recallScopeArgs
  });
  const statusRecall = await callTool('recall', {
    query: queries.status_query,
    limit: queries.recall_limit,
    ...recallScopeArgs
  });
  const statusSummary = summarizeRecallStep(statusRecall);
  let fallbackUsed = false;
  let statusFallback = null;
  let contextLayer = 'marsvault_recall';
  if (statusSummary.count <= 0) {
    statusFallback = await fetchLatestSessionCloseSnapshot(source);
    if (statusFallback) {
      fallbackUsed = true;
      contextLayer = 'session_close_fallback';
    } else {
      contextLayer = 'empty_boot';
    }
  }
  const contextMessage =
    contextLayer === 'marsvault_recall'
      ? 'session_boot 使用 MarsVault recall 作為當前上下文（Level 1/2）'
      : contextLayer === 'session_close_fallback'
        ? 'session_boot 未命中 MarsVault，已降級使用最近 session_close（Level 3）'
        : 'session_boot 未命中 MarsVault，且無可用 session_close，使用空白啟動';
  const healthArgs = {};
  if (args.alert_window_hours !== undefined) {
    healthArgs.alert_window_hours = args.alert_window_hours;
  }
  const health = await runHealthExpiryCheck(healthArgs);
  const previousPayload = existingHeartbeat
    ? parseJsonObject(existingHeartbeat.body) || {}
    : {};
  const previousTopic = normalizeOptionalText(previousPayload.topic, 200);
  const mergedTopic = topic || previousTopic || '';
  const mergedMood = mood || normalizeOptionalText(previousPayload.mood, 80) || '';
  const heartbeatPayload = {
    type: 'session_boot_heartbeat',
    profile: DB_PROFILE,
    source,
    date: dateKey,
    agent_name: queries.agent_name,
    user_name: queries.user_name || null,
    topic: mergedTopic || null,
    mood: mergedMood || null,
    identity_query: queries.identity_query,
    workflow_query: queries.workflow_query,
    status_query: queries.status_query,
    updated_at: nowTs.toISOString()
  };
  const savedHeartbeat = await upsertMemoryBySession({
    session_id: heartbeatSessionId,
    source,
    body: JSON.stringify(heartbeatPayload),
    tags: heartbeatTags,
    expires_at: heartbeatExpiry,
    existing: existingHeartbeat
  });
  const autoRecoveredClose = existingHeartbeat
    ? {
        checked_date: dateKey,
        needed: false,
        inserted: false,
        reason: 'already_session_booted_today'
      }
    : await ensureDailyCloseRecovery(source, nowTs);

  return {
    ok: true,
    profile: DB_PROFILE,
    mode: existingHeartbeat ? 'welcome_back' : 'new_day',
    source,
    date: dateKey,
    heartbeat_id: savedHeartbeat?.id || null,
    agent_name: queries.agent_name,
    last_topic: previousTopic || null,
    current_topic: mergedTopic || null,
    mood: mergedMood || null,
    queries: {
      identity_query: queries.identity_query,
      workflow_query: queries.workflow_query,
      status_query: queries.status_query
    },
    fallback_used: fallbackUsed,
    context_layer: contextLayer,
    context_message: contextMessage,
    soul: summarizeRecallStep(soulRecall),
    workflow: summarizeRecallStep(workflowRecall),
    status: {
      ...statusSummary,
      fallback_used: fallbackUsed,
      context_layer: contextLayer,
      fallback_session_close: statusFallback
    },
    health: summarizeSessionBootHealthStep(health),
    auto_recovered_close: autoRecoveredClose
  };
}

async function runDailyClose(args = {}) {
  const source = normalizeDailySource(args.source);
  const summary = normalizeOptionalText(args.summary, 6000);
  if (!summary) {
    throw new Error('summary is required');
  }
  const topics = normalizeDailyTopics(args.topics);
  const mood = normalizeOptionalText(args.mood, 80);
  const nowTs = new Date();
  const dateKey = dailyDateKey(nowTs);
  const toolUsageDailySummary = await fetchToolUsageDailySummary(dateKey);
  const closeSessionId = buildLifecycleSessionId('session_close', source, dateKey);
  let existingClose = await fetchMemoryBySessionId(closeSessionId, source);
  if (!existingClose) {
    const legacyCloseSessionId = buildLifecycleSessionId('daily_close', source, dateKey);
    existingClose = await fetchMemoryBySessionId(legacyCloseSessionId, source);
  }
  const topicTags = topics.map((topic) => `topic:${normalizeTopicTag(topic).slice(0, 40)}`);
  const closeTags = buildLifecycleMemoryTags(['session_close'], source, dateKey, topicTags);
  const closePayload = {
    type: 'session_close',
    profile: DB_PROFILE,
    source,
    date: dateKey,
    summary,
    topics,
    mood: mood || null,
    tool_usage_daily_summary: toolUsageDailySummary,
    updated_at: nowTs.toISOString()
  };
  const expiresAt = new Date(nowTs.getTime() + 7 * 24 * 3600000).toISOString();
  const savedClose = await upsertMemoryBySession({
    session_id: closeSessionId,
    source,
    body: JSON.stringify(closePayload),
    tags: closeTags,
    expires_at: expiresAt,
    existing: existingClose
  });
  const expirySnapshot = await runHealthExpiryCheck({
    alert_window_hours: 48
  });
  const soonExpiringCount = Math.max(
    0,
    Number(expirySnapshot?.expiry_alert?.soon_expiring_count) || 0
  );
  const recommendPromoteCount = Math.max(
    0,
    Number(expirySnapshot?.expiry_alert?.recommended_for_promotion_count) || 0
  );
  const expiryAction =
    recommendPromoteCount > 0
      ? '建議叫 Hermes 或三哥 promote'
      : soonExpiringCount > 0
        ? '有短記憶即將到期，建議先做 health_check 檢視'
        : null;

  return {
    ok: true,
    profile: DB_PROFILE,
    mode: existingClose ? 'updated' : 'created',
    close_id: savedClose?.id || null,
    source,
    date: dateKey,
    topics,
    mood: mood || null,
    tool_usage_daily_summary: toolUsageDailySummary,
    expiry_alert: {
      soon_expiring_count: soonExpiringCount,
      recommend_promote_count: recommendPromoteCount,
      action: expiryAction
    }
  };
}

async function fetchPaginatedRows(table, selectColumns, options = {}) {
  const pageSize = clampInteger(options.page_size, 100, 2000, 1000);
  const maxRows = clampInteger(options.max_rows, 1000, 50000, 20000);
  const order = String(options.order || '').trim();
  const filters = Array.isArray(options.filters) ? options.filters : [];

  const rows = [];
  let offset = 0;
  let truncated = false;

  while (rows.length < maxRows) {
    const query = new URLSearchParams();
    query.set('select', selectColumns);
    query.set('limit', String(pageSize));
    query.set('offset', String(offset));
    if (order) {
      query.set('order', order);
    }
    for (const filter of filters) {
      if (!filter || !filter.key) continue;
      if (filter.value === undefined || filter.value === null) continue;
      query.set(filter.key, String(filter.value));
    }

    const batch = await supabaseRequest(`/rest/v1/${table}?${query.toString()}`, {
      profile: DB_PROFILE
    });
    if (!Array.isArray(batch) || batch.length === 0) {
      break;
    }

    const remaining = maxRows - rows.length;
    if (batch.length > remaining) {
      rows.push(...batch.slice(0, remaining));
      truncated = true;
      break;
    }

    rows.push(...batch);
    if (batch.length < pageSize) {
      break;
    }
    offset += batch.length;
  }

  return { rows, truncated, page_size: pageSize, max_rows: maxRows };
}

function evaluatePromotionCandidate(memory, nowTs, longTermTagSet) {
  const body = String(memory?.body || '').trim();
  const tags = normalizeTags(memory?.tags).map(normalizeTopicTag).filter(Boolean);
  const expiresAt = parseTimestamp(memory?.expires_at);
  const alreadyPromoted = Boolean(memory?.promoted) || Boolean(memory?.promoted_at);
  if (alreadyPromoted) {
    return {
      recommend: 'N',
      score: 0,
      reason: '已 promoted'
    };
  }
  const reasons = [];
  let score = 0;

  if (tags.length > 0) {
    score += 1;
    reasons.push('有 tags');
  }
  if (body.length >= 120) {
    score += 1;
    reasons.push('內容較完整');
  }
  score += 1;
  reasons.push('未曾 promoted');
  if (tags.some((tag) => longTermTagSet.has(tag))) {
    score += 1;
    reasons.push('同現有長記憶主題有連結');
  }
  if (expiresAt) {
    const hoursLeft = Math.floor((expiresAt.getTime() - nowTs.getTime()) / 3600000);
    if (hoursLeft <= 12) {
      score += 1;
      reasons.push('12小時內到期');
    }
  }

  return {
    recommend: score >= 2 ? 'Y' : 'N',
    score,
    reason: reasons.join('、') || '訊息不足，保守不升級'
  };
}
function isSessionBootSessionId(sessionId) {
  const normalized = String(sessionId || '').trim().toLowerCase();
  return (
    normalized.startsWith('session_boot:') ||
    normalized.startsWith('daily_boot:')
  );
}
function normalizeSemanticTags(tags) {
  return normalizeTags(tags)
    .map((tag) => normalizeTopicTag(tag))
    .filter(
      (tag) =>
        tag &&
        !tag.startsWith('agent_body:') &&
        !tag.startsWith('environment:')
    );
}
function isLifecycleMemoryRow(memory) {
  const sessionId = String(memory?.session_id || '').trim();
  if (isSessionBootSessionId(sessionId) || isSessionCloseSessionId(sessionId)) {
    return true;
  }
  const tagSet = new Set(normalizeSemanticTags(memory?.tags));
  return (
    tagSet.has('session_boot') ||
    tagSet.has('session_close') ||
    tagSet.has('heartbeat')
  );
}
function buildForgetCandidates(memoryRows, nowTs, thresholdDays, limit) {
  const nowDate = toUtcStartOfDay(nowTs);
  const candidates = [];
  for (const memory of memoryRows) {
    if (Boolean(memory?.promoted) || Boolean(memory?.promoted_at)) continue;
    if (isLifecycleMemoryRow(memory)) continue;
    const createdAt = parseTimestamp(memory?.created_at);
    if (!createdAt) continue;
    const ageDays = Math.max(0, diffDaysUtc(toUtcStartOfDay(createdAt), nowDate));
    if (ageDays < thresholdDays) continue;

    const semanticTags = normalizeSemanticTags(memory?.tags);
    const body = String(memory?.body || '').trim();
    const expiresAt = parseTimestamp(memory?.expires_at);
    const reasons = [];
    if (semanticTags.length === 0) reasons.push('無主題 tags');
    if (body.length < 120) reasons.push('內容較短');
    if (expiresAt && expiresAt.getTime() - nowTs.getTime() > 7 * 24 * 3600000) {
      reasons.push('距離自然到期仍遠');
    }
    if (reasons.length < 2) continue;

    candidates.push({
      id: memory?.id || null,
      source: memory?.source || null,
      session_id: memory?.session_id || null,
      created_at: memory?.created_at || null,
      expires_at: memory?.expires_at || null,
      age_days: ageDays,
      tags: normalizeTags(memory?.tags),
      excerpt: body.slice(0, 140),
      reason: reasons.join('、')
    });
  }
  candidates.sort(
    (left, right) =>
      (right.age_days || 0) - (left.age_days || 0) ||
      String(left.id || '').localeCompare(String(right.id || ''))
  );
  return {
    stale_days_threshold: thresholdDays,
    total_candidates: candidates.length,
    limit,
    candidates: candidates.slice(0, limit)
  };
}

function buildHealthNarrative(payload) {
  const richTopic =
    payload.coverage_map.rich_topics.length > 0
      ? `${payload.coverage_map.rich_topics[0].topic}（${payload.coverage_map.rich_topics[0].count}）`
      : '未形成明顯主題';
  const sparseTopics =
    payload.coverage_map.sparse_topics.length > 0
      ? payload.coverage_map.sparse_topics.map((item) => item.topic).join('、')
      : '未見明顯稀疏主題';
  const timelineGapText =
    payload.count_chunks.gaps_over_threshold.length > 0
      ? `有 ${payload.count_chunks.gaps_over_threshold.length} 段超過門檻的時間空白`
      : '未見超過門檻的時間空白';
  const conflictStatus = String(payload?.detect_conflicts?.status || '');
  const conflictSummary =
    conflictStatus === 'ok'
      ? `高相似記憶對有 ${payload.detect_conflicts.total_pairs} 組，其中 SUPERSEDED ${payload.detect_conflicts.superseded_count} 組、CONFLICT ${payload.detect_conflicts.conflict_count} 組`
      : conflictStatus === 'unavailable'
        ? `衝突檢測暫不可用（${normalizeOptionalText(payload?.detect_conflicts?.message || 'unknown', 120)}）`
        : '衝突檢測未執行';
  const forgetSummary =
    Number(payload?.forget_candidates?.total_candidates || 0) > 0
      ? `可考慮 soft_forget 的候選有 ${payload.forget_candidates.total_candidates} 條（已列出前 ${payload.forget_candidates.candidates.length} 條）`
      : '目前未見需要優先 soft_forget 的候選';

  return `而家我有 ${payload.count_chunks.total_chunks} 個長記憶 chunk，最豐富主題係 ${richTopic}。` +
    `稀疏區域包括：${sparseTopics}。` +
    `只活喺短記憶的主題有 ${payload.coverage_map.volatile_topics_total} 個。` +
    `${payload.expiry_alert.alert_window_hours} 小時內到期短記憶有 ${payload.expiry_alert.soon_expiring_count} 條，` +
    `其中建議升長記憶 ${payload.expiry_alert.recommended_for_promotion_count} 條。` +
    `${timelineGapText}。` +
    `${conflictSummary}。` +
    `${forgetSummary}。`;
}
function buildExpiryNarrative({ alertWindowHours, soonExpiringCount, recommendedCount }) {
  return `${alertWindowHours} 小時內到期短記憶有 ${soonExpiringCount} 條，其中建議升長記憶 ${recommendedCount} 條。`;
}
function normalizeSimilarityThreshold(value, fallback = 0.85) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(0, Math.min(1, numeric));
}
function resolveChunkMoment(dateValue, createdAtValue) {
  const dateRaw = String(dateValue || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) {
    return new Date(`${dateRaw}T00:00:00.000Z`);
  }
  return parseTimestamp(createdAtValue);
}
function buildConflictPair(row, conflictWindowDays) {
  const leftMoment = resolveChunkMoment(row?.left_date, row?.left_created_at);
  const rightMoment = resolveChunkMoment(row?.right_date, row?.right_created_at);
  let newer = {
    id: row?.left_id || null,
    date: row?.left_date || null,
    source_file: row?.left_source_file || null,
    section: row?.left_section || null,
    tags: normalizeTags(row?.left_tags),
    excerpt: normalizeOptionalText(row?.left_content || '', 160)
  };
  let older = {
    id: row?.right_id || null,
    date: row?.right_date || null,
    source_file: row?.right_source_file || null,
    section: row?.right_section || null,
    tags: normalizeTags(row?.right_tags),
    excerpt: normalizeOptionalText(row?.right_content || '', 160)
  };
  if (
    leftMoment &&
    rightMoment &&
    rightMoment.getTime() > leftMoment.getTime()
  ) {
    newer = {
      id: row?.right_id || null,
      date: row?.right_date || null,
      source_file: row?.right_source_file || null,
      section: row?.right_section || null,
      tags: normalizeTags(row?.right_tags),
      excerpt: normalizeOptionalText(row?.right_content || '', 160)
    };
    older = {
      id: row?.left_id || null,
      date: row?.left_date || null,
      source_file: row?.left_source_file || null,
      section: row?.left_section || null,
      tags: normalizeTags(row?.left_tags),
      excerpt: normalizeOptionalText(row?.left_content || '', 160)
    };
  }
  const deltaDays =
    leftMoment && rightMoment
      ? Math.abs(
          diffDaysUtc(
            toUtcStartOfDay(leftMoment),
            toUtcStartOfDay(rightMoment)
          )
        )
      : null;
  const relation =
    deltaDays !== null && deltaDays <= conflictWindowDays
      ? 'CONFLICT'
      : 'SUPERSEDED';
  const reason =
    relation === 'CONFLICT'
      ? `時間距離 ${deltaDays ?? '未知'} 日，屬同期高相似內容`
      : deltaDays === null
        ? '缺少時間資訊，先歸類為 SUPERSEDED'
        : `時間距離 ${deltaDays} 日，較像新記憶取代舊記憶`;

  return {
    relation,
    similarity: Number.isFinite(Number(row?.similarity))
      ? Number(row.similarity)
      : 0,
    delta_days: deltaDays,
    reason,
    older,
    newer
  };
}
function hasHermesDigestSourcePrefix(value) {
  const sourceFile = String(value || '').trim().toLowerCase();
  return (
    sourceFile.startsWith('hermes/digest/') ||
    sourceFile.startsWith('hermes/totodigest/')
  );
}
function isHermesDigestConflictChunk(chunk) {
  const section = String(chunk?.section || '').trim().toLowerCase();
  const tagSet = new Set(
    normalizeTags(chunk?.tags).map((tag) => normalizeTopicTag(tag)).filter(Boolean)
  );
  const hasDigestTag = tagSet.has('digest');
  const hasCronTag = tagSet.has('cron');
  const hasHermesIdentityTag =
    tagSet.has('hermes') || tagSet.has('coco') || tagSet.has('toto');
  return (
    hasHermesDigestSourcePrefix(chunk?.source_file) ||
    section.startsWith('digest-coco-') ||
    section.startsWith('digest-toto-') ||
    (hasDigestTag && hasCronTag && hasHermesIdentityTag)
  );
}
function shouldExcludeConflictRow(row) {
  const leftChunk = {
    source_file: row?.left_source_file,
    section: row?.left_section,
    tags: row?.left_tags
  };
  const rightChunk = {
    source_file: row?.right_source_file,
    section: row?.right_section,
    tags: row?.right_tags
  };
  return (
    isHermesDigestConflictChunk(leftChunk) ||
    isHermesDigestConflictChunk(rightChunk)
  );
}
async function runConflictDetection(args = {}) {
  const similarityThreshold = normalizeSimilarityThreshold(
    args.similarity_threshold,
    0.85
  );
  const conflictWindowDays = clampInteger(
    args.conflict_window_days,
    1,
    120,
    14
  );
  const matchCount = clampInteger(args.match_count, 1, 200, 20);
  const scanLimit = clampInteger(args.scan_limit, 50, 5000, 400);
  const neighborLimit = clampInteger(args.neighbor_limit, 1, 20, 6);

  try {
    const result = await supabaseRequest('/rest/v1/rpc/detect_marsvault_conflicts', {
      method: 'POST',
      profile: DB_PROFILE,
      body: {
        p_similarity_threshold: similarityThreshold,
        p_match_count: matchCount,
        p_scan_limit: scanLimit,
        p_neighbor_limit: neighborLimit
      }
    });
    const rows = Array.isArray(result) ? result : [];
    const filteredRows = rows.filter((row) => !shouldExcludeConflictRow(row));
    const excludedHermesDigestPairs = Math.max(0, rows.length - filteredRows.length);
    const pairs = filteredRows.map((row) => buildConflictPair(row, conflictWindowDays));
    const supersededCount = pairs.filter(
      (item) => item.relation === 'SUPERSEDED'
    ).length;
    const conflictCount = pairs.filter(
      (item) => item.relation === 'CONFLICT'
    ).length;

    return {
      status: 'ok',
      similarity_threshold: similarityThreshold,
      conflict_window_days: conflictWindowDays,
      scan_limit: scanLimit,
      neighbor_limit: neighborLimit,
      match_count: matchCount,
      total_pairs: pairs.length,
      excluded_hermes_digest_pairs: excludedHermesDigestPairs,
      superseded_count: supersededCount,
      conflict_count: conflictCount,
      pairs
    };
  } catch (error) {
    return {
      status: 'unavailable',
      similarity_threshold: similarityThreshold,
      conflict_window_days: conflictWindowDays,
      scan_limit: scanLimit,
      neighbor_limit: neighborLimit,
      match_count: matchCount,
      total_pairs: 0,
      excluded_hermes_digest_pairs: 0,
      superseded_count: 0,
      conflict_count: 0,
      pairs: [],
      message: normalizeOptionalText(error?.message || String(error), 280)
    };
  }
}
async function runHealthExpiryCheck(args = {}) {
  const alertWindowHours = clampInteger(args.alert_window_hours, 1, 720, 48);
  const pageSize = clampInteger(args.page_size, 100, 2000, 1000);
  const maxRows = clampInteger(args.max_rows, 1000, 50000, 20000);
  const nowTs = new Date();
  const alertDeadlineTs = new Date(nowTs.getTime() + alertWindowHours * 3600000);
  const memoryLoad = await fetchPaginatedRows(
    'memories',
    'id,body,source,session_id,tags,promoted,promoted_at,created_at,expires_at',
    {
      page_size: pageSize,
      max_rows: maxRows,
      order: 'expires_at.asc'
    }
  );
  const memoryRows = memoryLoad.rows;
  const chunkLoad = await fetchPaginatedRows('marsvault_chunks', 'id,tags', {
    page_size: pageSize,
    max_rows: maxRows,
    order: 'created_at.desc'
  });
  const longTermTagSet = new Set(
    sortTagEntries(collectTagCounts(chunkLoad.rows)).map(([tag]) => tag)
  );
  const soonExpiringRows = memoryRows
    .map((memory) => ({
      memory,
      expires_at_ts: parseTimestamp(memory?.expires_at)
    }))
    .filter(
      (item) =>
        !Boolean(item.memory?.promoted) &&
        !Boolean(item.memory?.promoted_at) &&
        item.expires_at_ts &&
        item.expires_at_ts.getTime() > nowTs.getTime() &&
        item.expires_at_ts.getTime() <= alertDeadlineTs.getTime()
    )
    .sort((left, right) => left.expires_at_ts.getTime() - right.expires_at_ts.getTime());
  const soonExpiring = soonExpiringRows.map((entry) => {
    const recommendation = evaluatePromotionCandidate(entry.memory, nowTs, longTermTagSet);
    return {
      id: entry.memory.id,
      expires_at: entry.memory.expires_at,
      tags: normalizeTags(entry.memory.tags),
      excerpt: String(entry.memory.body || '').slice(0, 140),
      promoted: Boolean(entry.memory.promoted),
      promoted_at: entry.memory.promoted_at || null,
      recommend_promote: recommendation.recommend,
      recommendation_reason: recommendation.reason
    };
  });
  const recommendedForPromotionCount = soonExpiring.filter(
    (item) => item.recommend_promote === 'Y'
  ).length;
  const payload = {
    ok: true,
    profile: DB_PROFILE,
    mode: 'expiry_only',
    generated_at: nowTs.toISOString(),
    expiry_alert: {
      alert_window_hours: alertWindowHours,
      total_short_memories: memoryRows.length,
      soon_expiring_count: soonExpiring.length,
      recommended_for_promotion_count: recommendedForPromotionCount,
      soon_expiring: soonExpiring
    },
    diagnostics: {
      memory_rows_truncated: memoryLoad.truncated,
      chunk_rows_truncated: chunkLoad.truncated,
      page_size: pageSize,
      max_rows: maxRows
    }
  };
  payload.narrative = buildExpiryNarrative({
    alertWindowHours,
    soonExpiringCount: soonExpiring.length,
    recommendedCount: recommendedForPromotionCount
  });
  return payload;
}

async function runBatchPromote(args = {}) {
  const alertWindowHours = clampInteger(args.alert_window_hours, 1, 720, 48);
  const maxPromote = clampInteger(args.max_promote, 1, 50, 10);
  const dryRun = Boolean(args.dry_run);
  const origin = String(args.origin || 'batch-promote').trim() || 'batch-promote';
  const explicitIds = Array.isArray(args.memory_ids)
    ? args.memory_ids
        .map((id) => normalizeOptionalUuid(id, 'memory_ids'))
        .filter(Boolean)
    : [];

  const candidates = [];

  if (explicitIds.length > 0) {
    for (const memoryId of explicitIds.slice(0, maxPromote)) {
      const memory = await fetchMemoryById(memoryId);
      if (!memory) {
        candidates.push({ id: memoryId, status: 'not_found', skipped: true });
        continue;
      }
      if (memory.promoted || memory.promoted_at) {
        candidates.push({
          id: memoryId,
          status: 'already_promoted',
          skipped: true,
          excerpt: String(memory.body || '').slice(0, 140)
        });
        continue;
      }
      candidates.push({
        id: memoryId,
        status: 'eligible',
        skipped: false,
        excerpt: String(memory.body || '').slice(0, 140),
        tags: normalizeTags(memory.tags),
        expires_at: memory.expires_at || null,
        memory
      });
    }
  } else {
    const healthResult = await runHealthExpiryCheck({
      alert_window_hours: alertWindowHours
    });
    const soonExpiring = healthResult?.expiry_alert?.soon_expiring || [];
    const recommended = soonExpiring
      .filter((item) => item.recommend_promote === 'Y')
      .slice(0, maxPromote);

    for (const item of recommended) {
      const memory = await fetchMemoryById(item.id);
      if (!memory) {
        candidates.push({ id: item.id, status: 'not_found', skipped: true });
        continue;
      }
      candidates.push({
        id: item.id,
        status: 'eligible',
        skipped: false,
        excerpt: item.excerpt || String(memory.body || '').slice(0, 140),
        tags: item.tags || normalizeTags(memory.tags),
        expires_at: item.expires_at || memory.expires_at || null,
        recommendation_reason: item.recommendation_reason || null,
        memory
      });
    }
  }

  const eligible = candidates.filter((c) => !c.skipped);

  if (dryRun) {
    return {
      ok: true,
      dry_run: true,
      profile: DB_PROFILE,
      origin,
      alert_window_hours: alertWindowHours,
      max_promote: maxPromote,
      total_candidates: candidates.length,
      eligible_count: eligible.length,
      skipped_count: candidates.length - eligible.length,
      candidates: candidates.map(({ memory, ...rest }) => rest)
    };
  }

  const promoted = [];
  const errors = [];

  for (const candidate of eligible) {
    try {
      const memory = candidate.memory;
      const content = String(memory.body || '').trim();
      if (!content) {
        errors.push({ id: candidate.id, error: 'empty memory body' });
        continue;
      }

      const ingestResult = await ingestMarsvaultChunks(
        {
          content,
          tags: normalizeTags(memory.tags),
          source_memory_id: memory.id,
          source_session_id: memory.session_id || null,
          source_tool: memory.source || null,
          origin
        },
        {
          defaultType: 'insight',
          defaultSourceFile: PROFILE.memoryIngestDefaultSourceFile,
          defaultSectionPrefix: 'batch-promote',
          defaultOrigin: origin,
          body: DB_PROFILE,
          fixedTags: [...PROFILE.memoryIngestFixedTags, 'batch-promote']
        }
      );

      const promotedMemory = await markMemoryAsPromoted(memory.id);

      promoted.push({
        id: memory.id,
        chunk_count: ingestResult.chunk_count || 0,
        promoted_at: promotedMemory?.promoted_at || null,
        excerpt: String(content).slice(0, 140)
      });
    } catch (error) {
      errors.push({
        id: candidate.id,
        error: normalizeOptionalText(error?.message || String(error), 280)
      });
    }
  }

  return {
    ok: true,
    dry_run: false,
    profile: DB_PROFILE,
    origin,
    alert_window_hours: alertWindowHours,
    max_promote: maxPromote,
    total_candidates: candidates.length,
    promoted_count: promoted.length,
    error_count: errors.length,
    skipped_count: candidates.length - eligible.length,
    promoted,
    errors: errors.length > 0 ? errors : undefined,
    skipped: candidates
      .filter((c) => c.skipped)
      .map(({ memory, ...rest }) => rest)
  };
}

async function runHealthCheck(args = {}) {
  const alertWindowHours = clampInteger(args.alert_window_hours, 1, 720, 48);
  const gapDays = clampInteger(args.gap_days, 7, 365, 30);
  const topicLimit = clampInteger(args.topic_limit, 1, 20, 5);
  const pageSize = clampInteger(args.page_size, 100, 2000, 1000);
  const maxRows = clampInteger(args.max_rows, 1000, 50000, 20000);
  const conflictSimilarityThreshold = normalizeSimilarityThreshold(
    args.conflict_similarity_threshold,
    0.85
  );
  const conflictWindowDays = clampInteger(args.conflict_window_days, 1, 120, 14);
  const conflictMatchCount = clampInteger(args.conflict_match_count, 1, 200, 20);
  const conflictScanLimit = clampInteger(args.conflict_scan_limit, 50, 5000, 400);
  const conflictNeighborLimit = clampInteger(
    args.conflict_neighbor_limit,
    1,
    20,
    6
  );
  const forgetCandidateDays = clampInteger(args.forget_candidate_days, 3, 180, 14);
  const forgetCandidateLimit = clampInteger(args.forget_candidate_limit, 1, 50, 10);

  const nowTs = new Date();
  const nowDate = toUtcStartOfDay(nowTs);
  const alertDeadlineTs = new Date(nowTs.getTime() + alertWindowHours * 3600000);

  const chunkLoad = await fetchPaginatedRows('marsvault_chunks', 'id,date,created_at,tags', {
    page_size: pageSize,
    max_rows: maxRows,
    order: 'date.asc'
  });
  const memoryLoad = await fetchPaginatedRows(
    'memories',
    'id,body,source,session_id,tags,promoted,promoted_at,created_at,expires_at',
    {
      page_size: pageSize,
      max_rows: maxRows,
      order: 'expires_at.asc'
    }
  );

  const chunkRows = chunkLoad.rows;
  const memoryRows = memoryLoad.rows;

  const chunkDates = chunkRows
    .map((row) => parseDateOnly(row?.date || row?.created_at))
    .filter(Boolean)
    .sort((left, right) => left.getTime() - right.getTime());

  const monthlyCounts = new Map();
  for (const chunkDate of chunkDates) {
    const monthKey = formatDateOnly(chunkDate).slice(0, 7);
    monthlyCounts.set(monthKey, (monthlyCounts.get(monthKey) || 0) + 1);
  }
  const monthlyDistribution = Array.from(monthlyCounts.entries()).map(([month, count]) => ({
    month,
    count
  }));

  const oldestChunkDate = chunkDates.length > 0 ? formatDateOnly(chunkDates[0]) : null;
  const latestChunkDate =
    chunkDates.length > 0 ? formatDateOnly(chunkDates[chunkDates.length - 1]) : null;

  const gapsOverThreshold = [];
  for (let idx = 1; idx < chunkDates.length; idx += 1) {
    const previous = chunkDates[idx - 1];
    const current = chunkDates[idx];
    const quietDays = Math.max(0, diffDaysUtc(previous, current) - 1);
    if (quietDays > gapDays) {
      gapsOverThreshold.push({
        from: formatDateOnly(previous),
        to: formatDateOnly(current),
        quiet_days: quietDays
      });
    }
  }
  if (chunkDates.length > 0) {
    const latest = chunkDates[chunkDates.length - 1];
    const quietSinceLatest = diffDaysUtc(latest, nowDate);
    if (quietSinceLatest > gapDays) {
      gapsOverThreshold.push({
        from: formatDateOnly(latest),
        to: formatDateOnly(nowDate),
        quiet_days: quietSinceLatest,
        ongoing: true
      });
    }
  }

  const chunkTagCounts = collectTagCounts(chunkRows);
  const memoryTagCounts = collectTagCounts(memoryRows);
  const sortedChunkTags = sortTagEntries(chunkTagCounts);
  const sortedMemoryTags = sortTagEntries(memoryTagCounts);
  const longTermTagSet = new Set(sortedChunkTags.map(([tag]) => tag));

  const richTopics = sortedChunkTags.slice(0, topicLimit).map(([topic, count]) => ({
    topic,
    count
  }));
  const sparseTopics = sortedChunkTags
    .filter(([, count]) => count <= 1)
    .slice(0, topicLimit)
    .map(([topic, count]) => ({ topic, count }));
  const volatileTopics = sortedMemoryTags
    .filter(([topic]) => !longTermTagSet.has(topic))
    .slice(0, topicLimit)
    .map(([topic, count]) => ({ topic, count }));

  const soonExpiringRows = memoryRows
    .map((memory) => ({
      memory,
      expires_at_ts: parseTimestamp(memory?.expires_at)
    }))
    .filter(
      (item) =>
        !Boolean(item.memory?.promoted) &&
        !Boolean(item.memory?.promoted_at) &&
        item.expires_at_ts &&
        item.expires_at_ts.getTime() > nowTs.getTime() &&
        item.expires_at_ts.getTime() <= alertDeadlineTs.getTime()
    )
    .sort((left, right) => left.expires_at_ts.getTime() - right.expires_at_ts.getTime());

  const soonExpiring = soonExpiringRows.map((entry) => {
    const recommendation = evaluatePromotionCandidate(entry.memory, nowTs, longTermTagSet);
    return {
      id: entry.memory.id,
      expires_at: entry.memory.expires_at,
      tags: normalizeTags(entry.memory.tags),
      excerpt: String(entry.memory.body || '').slice(0, 140),
      promoted: Boolean(entry.memory.promoted),
      promoted_at: entry.memory.promoted_at || null,
      recommend_promote: recommendation.recommend,
      recommendation_reason: recommendation.reason
    };
  });
  const recommendedForPromotionCount = soonExpiring.filter(
    (item) => item.recommend_promote === 'Y'
  ).length;
  const conflictDetection = await runConflictDetection({
    similarity_threshold: conflictSimilarityThreshold,
    conflict_window_days: conflictWindowDays,
    match_count: conflictMatchCount,
    scan_limit: conflictScanLimit,
    neighbor_limit: conflictNeighborLimit
  });
  const forgetCandidates = buildForgetCandidates(
    memoryRows,
    nowTs,
    forgetCandidateDays,
    forgetCandidateLimit
  );

  const payload = {
    ok: true,
    profile: DB_PROFILE,
    generated_at: nowTs.toISOString(),
    count_chunks: {
      total_chunks: chunkRows.length,
      monthly_distribution: monthlyDistribution,
      oldest_chunk_date: oldestChunkDate,
      latest_chunk_date: latestChunkDate,
      gaps_over_threshold: gapsOverThreshold,
      gap_days_threshold: gapDays
    },
    expiry_alert: {
      alert_window_hours: alertWindowHours,
      total_short_memories: memoryRows.length,
      soon_expiring_count: soonExpiring.length,
      recommended_for_promotion_count: recommendedForPromotionCount,
      soon_expiring: soonExpiring
    },
    coverage_map: {
      long_term_tag_topics_total: sortedChunkTags.length,
      rich_topics: richTopics,
      sparse_topics: sparseTopics,
      volatile_topics_total: sortedMemoryTags.filter(([topic]) => !longTermTagSet.has(topic)).length,
      volatile_topics: volatileTopics,
      blank_topics_estimate: volatileTopics.map((item) => item.topic)
    },
    detect_conflicts: conflictDetection,
    forget_candidates: {
      ...forgetCandidates,
      action:
        forgetCandidates.total_candidates > 0
          ? 'suggest_only_use_soft_forget_to_apply'
          : null
    },
    diagnostics: {
      chunk_rows_truncated: chunkLoad.truncated,
      memory_rows_truncated: memoryLoad.truncated,
      page_size: pageSize,
      max_rows: maxRows,
      forget_candidate_days: forgetCandidateDays,
      forget_candidate_limit: forgetCandidateLimit
    }
  };
  payload.narrative = buildHealthNarrative(payload);

  return payload;
}

function parseFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : NaN;
}

function normalizeEmbeddingVector(rawVector) {
  if (!Array.isArray(rawVector) || rawVector.length === 0) {
    throw new Error('embedding vector missing');
  }
  const values = rawVector.map((value) => parseFiniteNumber(value));
  if (values.some((value) => Number.isNaN(value))) {
    throw new Error('embedding vector contains non-numeric values');
  }
  return values;
}

function embeddingVectorToText(rawVector) {
  const vector = normalizeEmbeddingVector(rawVector);
  if (vector.length !== JINA_EMBEDDING_DIMENSIONS_SAFE) {
    throw new Error(
      `embedding dimensions mismatch: expected ${JINA_EMBEDDING_DIMENSIONS_SAFE}, got ${vector.length}`
    );
  }
  return `[${vector.join(',')}]`;
}

async function createJinaEmbedding(inputText, task) {
  if (!JINA_API_KEY) {
    throw new Error('JINA_API_KEY is not configured');
  }
  const text = String(inputText || '').trim();
  if (!text) {
    throw new Error('embedding input text is required');
  }
  const payload = {
    model: JINA_EMBEDDING_MODEL,
    input: [text],
    embedding_type: 'float',
    dimensions: JINA_EMBEDDING_DIMENSIONS_SAFE
  };
  if (task) {
    payload.task = task;
  }

  const response = await fetch(JINA_EMBEDDING_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${JINA_API_KEY}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const raw = await response.text();
  let parsed;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = raw;
  }

  if (!response.ok) {
    const detail = typeof parsed === 'string' ? parsed : JSON.stringify(parsed ?? {});
    throw new Error(`Jina embeddings ${response.status}: ${detail}`);
  }

  const embedding = parsed?.data?.[0]?.embedding;
  return normalizeEmbeddingVector(embedding);
}

async function setMemoryEmbedding(memoryId, embeddingVector) {
  const embeddingText = embeddingVectorToText(embeddingVector);
  await supabaseRequest('/rest/v1/rpc/set_memory_embedding', {
    method: 'POST',
    profile: DB_PROFILE,
    body: {
      p_memory_id: memoryId,
      p_embedding_text: embeddingText
    }
  });
}
function normalizeMemoryIngestOrigin(value) {
  if (DB_PROFILE === 'coco') {
    const normalized = String(value || PROFILE.memoryIngestDefaultOrigin)
      .trim()
      .toLowerCase();
    if (!COCO_MEMORY_INGEST_ORIGIN_WHITELIST.has(normalized)) {
      throw new Error(
        'origin must be one of perplexity-coco/cursor-coco/warp-coco/leo-manual/hermes-coco-digest'
      );
    }
    return normalized;
  }

  const normalized = String(value || '').trim();
  if (!normalized) {
    throw new Error('origin is required');
  }
  return normalized;
}

async function ingestMarsvaultChunks(args = {}, options = {}) {
  const {
    defaultType = 'digest',
    defaultSourceFile = 'Hermes/Digest/auto.md',
    defaultSectionPrefix = 'digest',
    defaultOrigin = PROFILE.digestDefaultOrigin,
    body = DB_PROFILE,
    fixedTags = [],
    normalizeOrigin = null
  } = options;

  const content = String(args.content || '').trim();
  if (!content) {
    throw new Error('content is required');
  }
  if (content.length > 250000) {
    throw new Error('content too long (max 250000 chars)');
  }
  if (!JINA_API_KEY) {
    throw new Error('JINA_API_KEY is not configured');
  }

  const normalizedBody = normalizeChunkBody(body);
  if (normalizedBody !== DB_PROFILE) {
    throw new Error(`${DB_PROFILE} gateway only accepts body=${DB_PROFILE} for ingest`);
  }
  const visibility = normalizeChunkVisibility(args.visibility);
  const type = String(args.type || defaultType).trim() || defaultType;
  const date = normalizeChunkDate(args.date);
  const sourceFile = String(args.source_file || defaultSourceFile).trim() || defaultSourceFile;
  const sectionPrefix = String(args.section || defaultSectionPrefix).trim() || defaultSectionPrefix;
  const originRaw = String(args.origin || defaultOrigin).trim() || defaultOrigin;
  const origin = typeof normalizeOrigin === 'function' ? normalizeOrigin(originRaw) : originRaw;
  const sourceMemoryId = normalizeOptionalUuid(args.source_memory_id, 'source_memory_id') || null;
  const sourceSessionId = normalizeOptionalText(args.source_session_id, 200) || null;
  const sourceTool = normalizeOptionalSourceTool(args.source_tool) || null;
  const sourceUserNote = normalizeOptionalText(args.source_user_note, 500) || null;
  const agentBody = resolveWriteAgentBody({
    ...args,
    source_tool: sourceTool || args.source_tool,
    origin
  });
  const environment = resolveWriteEnvironment(args);
  const chunkTexts = splitDigestContent(content, args.max_chunk_chars);
  if (chunkTexts.length === 0) {
    throw new Error('content produced no chunks');
  }

  const baseTags = normalizeTags(args.tags);
  const mergedTagSet = new Set([...fixedTags, ...baseTags]);
  const tags = normalizeMemoryTagsWithContext(Array.from(mergedTagSet), agentBody, environment);
  const rows = [];

  for (let index = 0; index < chunkTexts.length; index += 1) {
    const chunkText = chunkTexts[index];
    const embedding = await createJinaEmbedding(chunkText, 'retrieval.passage');
    const embeddingText = embeddingVectorToText(embedding);
    const contentHash = crypto.createHash('sha256').update(chunkText).digest('hex');
    rows.push({
      id: crypto.randomUUID(),
      content: chunkText,
      embedding: embeddingText,
      source_file: sourceFile,
      section: `${sectionPrefix}#${index + 1}`,
      body: normalizedBody,
      visibility,
      tags,
      type,
      date,
      content_hash: contentHash,
      origin,
      source_memory_id: sourceMemoryId,
      source_session_id: sourceSessionId,
      source_tool: sourceTool,
      source_user_note: sourceUserNote,
      agent_body: agentBody,
      environment
    });
  }

  const insertedRows = await supabaseRequest(
    '/rest/v1/marsvault_chunks?on_conflict=source_file,section,content_hash,body&select=id,source_file,section,body,visibility,type,date,origin,source_memory_id,source_session_id,source_tool,source_user_note,agent_body,environment,created_at,updated_at',
    {
      method: 'POST',
      profile: DB_PROFILE,
      prefer: 'resolution=merge-duplicates,return=representation',
      body: rows
    }
  );

  return {
    ok: true,
    chunk_count: chunkTexts.length,
    inserted_count: Array.isArray(insertedRows) ? insertedRows.length : 0,
    source_file: sourceFile,
    section_prefix: sectionPrefix,
    body: normalizedBody,
    visibility,
    origin,
    source_memory_id: sourceMemoryId,
    source_session_id: sourceSessionId,
    source_tool: sourceTool,
    source_user_note: sourceUserNote,
    agent_body: agentBody,
    environment,
    date,
    items: Array.isArray(insertedRows) ? insertedRows : []
  };
}
function buildPromoteTimeline(chunk, sourceMemory) {
  const sourceCreatedAt = parseTimestamp(sourceMemory?.created_at);
  const sourcePromotedAt = parseTimestamp(sourceMemory?.promoted_at);
  const chunkCreatedAt = parseTimestamp(chunk?.created_at);
  const sourceToChunkSeconds =
    sourceCreatedAt && chunkCreatedAt
      ? Math.max(0, Math.floor((chunkCreatedAt.getTime() - sourceCreatedAt.getTime()) / 1000))
      : null;
  const sourceToPromotedSeconds =
    sourceCreatedAt && sourcePromotedAt
      ? Math.max(0, Math.floor((sourcePromotedAt.getTime() - sourceCreatedAt.getTime()) / 1000))
      : null;
  return {
    source_memory_created_at: sourceMemory?.created_at || null,
    source_memory_promoted_at: sourceMemory?.promoted_at || null,
    chunk_created_at: chunk?.created_at || null,
    source_to_chunk_seconds: sourceToChunkSeconds,
    source_to_promoted_seconds: sourceToPromotedSeconds
  };
}
async function runExplainMemory(args = {}) {
  const chunkId = normalizeOptionalUuid(args.id, 'id');
  if (!chunkId) {
    throw new Error('id is required');
  }

  const chunk = await fetchChunkById(chunkId);
  if (!chunk) {
    throw new Error(`memory chunk not found: ${chunkId}`);
  }

  const sourceMemoryId = normalizeOptionalUuid(chunk.source_memory_id, 'source_memory_id') || '';
  const sourceSessionId = normalizeOptionalText(chunk.source_session_id, 200) || '';
  const sourceTool = normalizeOptionalSourceTool(chunk.source_tool) || '';
  const sourceUserNote = normalizeOptionalText(chunk.source_user_note, 500) || '';

  let sourceMemory = null;
  if (sourceMemoryId) {
    sourceMemory = await fetchMemoryById(sourceMemoryId);
  }
  if (!sourceMemory && sourceSessionId) {
    sourceMemory = await fetchLatestMemoryBySession(sourceSessionId, sourceTool);
  }

  return {
    ok: true,
    id: chunk.id,
    chunk: {
      id: chunk.id,
      source_file: chunk.source_file || null,
      section: chunk.section || null,
      type: chunk.type || null,
      date: chunk.date || null,
      origin: chunk.origin || null,
      excerpt: normalizeOptionalText(chunk.content, 220) || null,
      created_at: chunk.created_at || null
    },
    source_short_memory: sourceMemory
      ? {
          id: sourceMemory.id || null,
          source: sourceMemory.source || null,
          session_id: sourceMemory.session_id || null,
          excerpt: normalizeOptionalText(sourceMemory.body, 280) || null,
          created_at: sourceMemory.created_at || null,
          promoted: Boolean(sourceMemory.promoted),
          promoted_at: sourceMemory.promoted_at || null
        }
      : null,
    source_session_meta: {
      source_memory_id: sourceMemoryId || sourceMemory?.id || null,
      source_session_id: sourceSessionId || sourceMemory?.session_id || null,
      source_tool: sourceTool || sourceMemory?.source || null,
      source_user_note: sourceUserNote || null
    },
    promote_timeline: buildPromoteTimeline(chunk, sourceMemory)
  };
}

function resolveToolName(name) {
  const normalized = String(name || '').trim();
  if (!normalized) return '';
  if (normalized === 'daily_boot') return 'session_boot';
  if (normalized === 'daily_close') return 'session_close';
  if (normalized === 'ingest_marsvault_digest') return 'dream_ingest';
  if (PROFILE.memoryIngestLegacyToolNames.includes(normalized)) {
    return PROFILE.memoryIngestToolName;
  }
  return normalized;
}

async function callTool(name, args = {}) {
  const toolName = resolveToolName(name);
  const telemetryStartedAtMs = Date.now();
  const telemetryStartedAtIso = new Date(telemetryStartedAtMs).toISOString();
  const telemetryTokensEstimate = estimateToolUsageTokens(toolName, args);
  const telemetryAgentBody = resolveToolUsageAgentBody(toolName, args);
  try {
    if (toolName === 'insert_memory') {
      const body = String(args.body || '').trim();
      const source = String(args.source || '').trim();
      const sessionId = String(args.session_id || '').trim();
      const agentBody = resolveWriteAgentBody({ ...args, source });
      const environment = resolveWriteEnvironment(args);
      const tags = normalizeMemoryTagsWithContext(args.tags, agentBody, environment);

      if (!body) {
        throw new Error('body is required');
      }
      if (body.length > 12000) {
        throw new Error('body too long (max 12000 chars)');
      }
      validateMemorySource(source);
      if (!sessionId) {
        throw new Error('session_id is required');
      }

      const memoryId = crypto.randomUUID();
      const payload = {
        id: memoryId,
        body,
        source,
        session_id: sessionId,
        tags,
        agent_body: agentBody,
        environment
      };
      if (typeof args.expires_at === 'string' && args.expires_at.trim()) {
        payload.expires_at = args.expires_at.trim();
      }

      const result = await supabaseRequest(
        '/rest/v1/memories?select=id,source,session_id,tags,agent_body,environment,created_at,expires_at',
        {
          method: 'POST',
          profile: DB_PROFILE,
          prefer: 'return=representation',
          body: [payload]
        }
      );
      let inserted = result?.[0] ?? null;
      if (!inserted) {
        const fetched = await supabaseRequest(
          `/rest/v1/memories?id=eq.${memoryId}&select=id,source,session_id,tags,agent_body,environment,created_at,expires_at`,
          { profile: DB_PROFILE }
        );
        inserted = fetched?.[0] ?? null;
      }
      let embedding_status = 'skipped_no_api_key';
      let embedding_error = null;
      if (JINA_API_KEY) {
        try {
          const embedding = await createJinaEmbedding(body, 'retrieval.passage');
          await setMemoryEmbedding(memoryId, embedding);
          embedding_status = 'stored';
        } catch (error) {
          embedding_status = 'failed';
          embedding_error = String(error?.message || error);
        }
      }

      return {
        ok: true,
        inserted,
        embedding_status,
        ...(embedding_error ? { embedding_error } : {})
      };
    }

    if (toolName === 'list_memories') {
      const limitRaw = Number(args.limit ?? 20);
      const limit = Number.isFinite(limitRaw)
        ? Math.max(1, Math.min(100, Math.trunc(limitRaw)))
        : 20;
      const source = args.source ? String(args.source).trim() : '';
      const unexpiredOnly = args.unexpired_only !== false;
      if (source) {
        validateMemorySource(source, { required: false });
      }

      const query = new URLSearchParams();
      query.set(
        'select',
        'id,body,source,session_id,tags,agent_body,environment,promoted,promoted_at,created_at,expires_at'
      );
      query.set('order', 'created_at.desc');
      query.set('limit', String(limit));
      if (source) {
        query.set('source', `eq.${source}`);
      }
      if (unexpiredOnly) {
        query.set('expires_at', 'gt.now()');
      }

      const result = await supabaseRequest(`/rest/v1/memories?${query.toString()}`, {
        profile: DB_PROFILE
      });
      return {
        ok: true,
        count: Array.isArray(result) ? result.length : 0,
        items: Array.isArray(result) ? result : []
      };
    }

    if (toolName === 'search_memories') {
      const queryText = String(args.query || '').trim();
      const limitRaw = Number(args.limit ?? 20);
      const limit = Number.isFinite(limitRaw)
        ? Math.max(1, Math.min(100, Math.trunc(limitRaw)))
        : 20;
      const source = args.source ? String(args.source).trim() : '';
      const unexpiredOnly = args.unexpired_only !== false;
      const minSimilarityRaw = args.min_similarity;
      const minSimilarity =
        minSimilarityRaw === undefined || minSimilarityRaw === null
          ? null
          : Number(minSimilarityRaw);

      if (!queryText) {
        throw new Error('query is required');
      }
      if (source) {
        validateMemorySource(source, { required: false });
      }
      if (minSimilarity !== null && !Number.isFinite(minSimilarity)) {
        throw new Error('min_similarity must be a finite number');
      }
      if (!JINA_API_KEY) {
        throw new Error('JINA_API_KEY is not configured');
      }
      const scopeFilters = resolveScopeFilters(args, inferAgentBodyFromSource(source));

      const queryEmbedding = await createJinaEmbedding(queryText, 'retrieval.query');
      const queryEmbeddingText = embeddingVectorToText(queryEmbedding);
      const result = await supabaseRequest('/rest/v1/rpc/search_memories_semantic', {
        method: 'POST',
        profile: DB_PROFILE,
        body: {
          p_query_embedding_text: queryEmbeddingText,
          p_match_count: limit,
          p_source: source || null,
          p_unexpired_only: unexpiredOnly,
          p_scope: scopeFilters.scope,
          p_agent_body: scopeFilters.agent_body,
          p_environment: scopeFilters.environment
        }
      });

      const items = Array.isArray(result) ? result : [];
      const filteredItems =
        minSimilarity === null
          ? items
          : items.filter((item) => Number(item?.similarity) >= minSimilarity);

      return {
        ok: true,
        count: filteredItems.length,
        scope: scopeFilters,
        items: filteredItems
      };
    }
    if (toolName === 'reload_source_registry') {
      return await reloadSourceRegistryCache({ manual: true });
    }

    if (toolName === 'recall') {
      const queryText = String(args.query || '').trim();
      const limitRaw = Number(args.limit ?? 5);
      const limit = Number.isFinite(limitRaw)
        ? Math.max(1, Math.min(50, Math.trunc(limitRaw)))
        : 5;
      const debugExplainRaw = args.debug_explain;
      const debugExplain =
        debugExplainRaw === undefined ? false : debugExplainRaw === true;
      const body = args.body ? String(args.body).trim() : DB_PROFILE;
      const includeGlobal = args.include_global !== false;
      const includeShared = args.include_shared !== false;
      const includePrivate = args.include_private !== false;
      const type = args.type ? String(args.type).trim() : '';
      const minSimilarityRaw = args.min_similarity;
      const minSimilarity =
        minSimilarityRaw === undefined || minSimilarityRaw === null
          ? null
          : Number(minSimilarityRaw);

      if (!queryText) {
        throw new Error('query is required');
      }
      if (!PROFILE.recallBodyEnum.includes(body)) {
        throw new Error(RECALL_BODY_VALIDATION_MESSAGE);
      }
      if (
        debugExplainRaw !== undefined &&
        typeof debugExplainRaw !== 'boolean'
      ) {
        throw new Error('debug_explain must be a boolean');
      }
      if (minSimilarity !== null && !Number.isFinite(minSimilarity)) {
        throw new Error('min_similarity must be a finite number');
      }
      if (!JINA_API_KEY) {
        throw new Error('JINA_API_KEY is not configured');
      }
      const scopeFilters = resolveScopeFilters(
        args,
        normalizeOptionalAgentBody(args.body)
      );

      const queryEmbedding = await createJinaEmbedding(queryText, 'retrieval.query');
      const queryEmbeddingText = embeddingVectorToText(queryEmbedding);
      const result = await supabaseRequest('/rest/v1/rpc/search_marsvault_chunks_semantic', {
        method: 'POST',
        profile: DB_PROFILE,
        body: {
          p_query_embedding_text: queryEmbeddingText,
          p_match_count: limit,
          p_body: body,
          p_include_global: includeGlobal,
          p_include_shared: includeShared,
          p_include_private: includePrivate,
          p_type: type || null,
          p_scope: scopeFilters.scope,
          p_agent_body: scopeFilters.agent_body,
          p_environment: scopeFilters.environment
        }
      });

      const items = Array.isArray(result) ? result : [];
      const filteredItems =
        minSimilarity === null
          ? items
          : items.filter((item) => Number(item?.similarity) >= minSimilarity);
      const explained = explainRecall(queryText, filteredItems, {
        debug_explain: debugExplain
      });

      return {
        ok: true,
        count: explained.items.length,
        scope: scopeFilters,
        ...(debugExplain
          ? {
              debug_explain: {
                query_tokens: explained.query_tokens
              }
            }
          : {}),
        items: explained.items
      };
    }
    if (toolName === 'explain_memory') {
      return await runExplainMemory(args);
    }
    if (toolName === 'demote_memory') {
      const chunkId = normalizeOptionalUuid(args.id, 'id');
      if (!chunkId) {
        throw new Error('id is required');
      }
      const deprecatedReason = normalizeOptionalText(args.deprecated_reason, 500);
      if (!deprecatedReason) {
        throw new Error('deprecated_reason is required');
      }
      const supersededBy = normalizeOptionalUuid(args.superseded_by, 'superseded_by');
      if (supersededBy && supersededBy === chunkId) {
        throw new Error('superseded_by must be different from id');
      }
      if (supersededBy) {
        const replacementChunk = await fetchChunkById(supersededBy);
        if (!replacementChunk) {
          throw new Error(`superseded_by chunk not found: ${supersededBy}`);
        }
      }
      const deprecatedAt =
        normalizeOptionalIsoTimestamp(args.deprecated_at, 'deprecated_at') ||
        new Date().toISOString();
      const patchQuery = new URLSearchParams();
      patchQuery.set('id', `eq.${chunkId}`);
      patchQuery.set(
        'select',
        'id,source_file,section,body,visibility,tags,type,date,origin,deprecated_at,deprecated_reason,superseded_by,updated_at'
      );
      const rows = await supabaseRequest(
        `/rest/v1/marsvault_chunks?${patchQuery.toString()}`,
        {
          method: 'PATCH',
          profile: DB_PROFILE,
          prefer: 'return=representation',
          body: {
            deprecated_at: deprecatedAt,
            deprecated_reason: deprecatedReason,
            superseded_by: supersededBy || null
          }
        }
      );
      const demoted = Array.isArray(rows) ? rows[0] : null;
      if (!demoted) {
        throw new Error(`memory chunk not found: ${chunkId}`);
      }
      return {
        ok: true,
        demoted
      };
    }
    if (toolName === 'soft_forget') {
      const requestedIds = Array.isArray(args.ids) ? args.ids : [];
      if (requestedIds.length === 0) {
        throw new Error('ids is required');
      }
      const normalizedIds = [];
      for (const rawId of requestedIds) {
        const normalizedId = normalizeOptionalUuid(rawId, 'ids');
        if (!normalizedId) continue;
        normalizedIds.push(normalizedId);
      }
      const dedupedIds = Array.from(new Set(normalizedIds));
      if (dedupedIds.length === 0) {
        throw new Error('ids must contain at least one valid UUID');
      }
      const reason = normalizeOptionalText(args.reason, 500);
      const forgottenAtIso =
        normalizeOptionalIsoTimestamp(args.forgotten_at, 'forgotten_at') ||
        new Date().toISOString();
      const forgottenAtTs = parseTimestamp(forgottenAtIso) || new Date();

      const lookupQuery = new URLSearchParams();
      lookupQuery.set(
        'select',
        'id,source,session_id,promoted,promoted_at,created_at,expires_at'
      );
      lookupQuery.set('id', `in.(${dedupedIds.join(',')})`);
      const existingRows = await supabaseRequest(
        `/rest/v1/memories?${lookupQuery.toString()}`,
        {
          profile: DB_PROFILE
        }
      );
      const foundRows = Array.isArray(existingRows) ? existingRows : [];
      const foundMap = new Map(foundRows.map((row) => [String(row?.id || ''), row]));
      const notFoundIds = dedupedIds.filter((id) => !foundMap.has(id));
      const toForgetIds = [];
      const skippedItems = [];
      for (const id of dedupedIds) {
        const row = foundMap.get(id);
        if (!row) continue;
        const expiresAtTs = parseTimestamp(row.expires_at);
        if (expiresAtTs && expiresAtTs.getTime() <= forgottenAtTs.getTime()) {
          skippedItems.push({
            id,
            expires_at: row.expires_at || null,
            reason: 'already_expired'
          });
          continue;
        }
        toForgetIds.push(id);
      }

      let forgottenRows = [];
      if (toForgetIds.length > 0) {
        const patchQuery = new URLSearchParams();
        patchQuery.set('id', `in.(${toForgetIds.join(',')})`);
        patchQuery.set(
          'select',
          'id,source,session_id,promoted,promoted_at,created_at,expires_at'
        );
        const patchedRows = await supabaseRequest(
          `/rest/v1/memories?${patchQuery.toString()}`,
          {
            method: 'PATCH',
            profile: DB_PROFILE,
            prefer: 'return=representation',
            body: {
              expires_at: forgottenAtIso
            }
          }
        );
        forgottenRows = Array.isArray(patchedRows) ? patchedRows : [];
      }

      return {
        ok: true,
        forgotten_at: forgottenAtIso,
        reason: reason || null,
        requested_count: dedupedIds.length,
        forgotten_count: forgottenRows.length,
        skipped_count: skippedItems.length,
        not_found_count: notFoundIds.length,
        forgotten: forgottenRows,
        skipped: skippedItems,
        not_found_ids: notFoundIds
      };
    }

    if (toolName === 'batch_promote') {
      return await runBatchPromote(args);
    }
    if (toolName === 'health_check') {
      return await runHealthCheck(args);
    }
    if (toolName === 'session_boot') {
      return await runDailyBoot(args);
    }
    if (toolName === 'session_close') {
      return await runDailyClose(args);
    }

    if (toolName === 'dream_ingest') {
      return await ingestMarsvaultChunks(args, {
        defaultType: 'digest',
        defaultSourceFile: 'Hermes/Digest/auto.md',
        defaultSectionPrefix: 'digest',
        defaultOrigin: PROFILE.digestDefaultOrigin,
        body: DB_PROFILE,
        fixedTags: ['hermes', 'digest']
      });
    }
    if (toolName === PROFILE.memoryIngestToolName) {
      const sourceMemoryId = normalizeOptionalUuid(args.source_memory_id, 'source_memory_id');
      let linkedMemory = null;
      if (sourceMemoryId) {
        linkedMemory = await fetchMemoryById(sourceMemoryId);
        if (!linkedMemory) {
          throw new Error(`source_memory_id not found: ${sourceMemoryId}`);
        }
      }
      const sourceSessionId =
        normalizeOptionalText(args.source_session_id, 200) ||
        normalizeOptionalText(linkedMemory?.session_id, 200);
      const sourceTool =
        normalizeOptionalSourceTool(args.source_tool) ||
        normalizeOptionalSourceTool(linkedMemory?.source);
      const sourceUserNote = normalizeOptionalText(args.source_user_note, 500);
      const ingestAgentBody =
        normalizeOptionalAgentBody(args.agent_body) ||
        normalizeOptionalAgentBody(linkedMemory?.agent_body);
      const ingestEnvironment =
        normalizeOptionalEnvironment(args.environment) ||
        normalizeOptionalEnvironment(linkedMemory?.environment);
      const ingestArgs = {
        ...args,
        ...(sourceMemoryId ? { source_memory_id: sourceMemoryId } : {}),
        ...(sourceSessionId ? { source_session_id: sourceSessionId } : {}),
        ...(sourceTool ? { source_tool: sourceTool } : {}),
        ...(sourceUserNote ? { source_user_note: sourceUserNote } : {}),
        ...(ingestAgentBody ? { agent_body: ingestAgentBody } : {}),
        ...(ingestEnvironment ? { environment: ingestEnvironment } : {})
      };
      const ingestResult = await ingestMarsvaultChunks(ingestArgs, {
        defaultType: 'insight',
        defaultSourceFile: PROFILE.memoryIngestDefaultSourceFile,
        defaultSectionPrefix: 'insight',
        defaultOrigin: PROFILE.memoryIngestDefaultOrigin,
        body: DB_PROFILE,
        fixedTags: PROFILE.memoryIngestFixedTags,
        normalizeOrigin: normalizeMemoryIngestOrigin
      });
      let promotedMemory = null;
      if (sourceMemoryId) {
        promotedMemory = await markMemoryAsPromoted(sourceMemoryId);
      }
      return {
        ...ingestResult,
        source_memory_id: sourceMemoryId || null,
        source_session_id: sourceSessionId || null,
        source_tool: sourceTool || null,
        source_user_note: sourceUserNote || null,
        promoted_memory: promotedMemory
          ? {
              id: promotedMemory.id || sourceMemoryId,
              promoted: Boolean(promotedMemory.promoted),
              promoted_at: promotedMemory.promoted_at || null
            }
          : null
      };
    }

    throw new Error(`Unknown tool: ${name}`);
  } finally {
    await writeToolUsageTelemetry({
      tool_name: toolName,
      timestamp: telemetryStartedAtIso,
      latency_ms: Math.max(0, Date.now() - telemetryStartedAtMs),
      tokens_estimate: telemetryTokensEstimate,
      agent_body: telemetryAgentBody
    });
  }
}

function inferBaseUrl(req) {
  const rawProto = String(req.headers['x-forwarded-proto'] || 'http');
  const proto = rawProto.split(',')[0].trim() || 'http';
  const host = String(
    req.headers['x-forwarded-host'] ||
      req.headers.host ||
      'localhost'
  )
    .split(',')[0]
    .trim();
  return `${proto}://${host}`;
}

function extractRequestHost(req) {
  return String(req.headers['x-forwarded-host'] || req.headers.host || '')
    .split(',')[0]
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, '');
}

function isIpv4Address(host) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

function isPrivateHost(host) {
  if (!host) return false;
  if (host === 'localhost' || host.endsWith('.local')) {
    return true;
  }
  if (!isIpv4Address(host)) {
    return false;
  }
  const [a, b] = host.split('.').map((n) => Number.parseInt(n, 10));
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

function isPublicHost(host) {
  if (!host) return false;
  return PUBLIC_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`)
  );
}

function shouldRequireBearer(req) {
  if (!REQUIRE_BEARER) return false;
  const host = extractRequestHost(req);
  if (BYPASS_BEARER_FOR_PRIVATE && isPrivateHost(host)) {
    return false;
  }
  if (isPublicHost(host)) {
    return true;
  }
  return true;
}

function oauthProtectedResourceMetadata(baseUrl) {
  return {
    resource: `${baseUrl}/mcp`,
    authorization_servers: [baseUrl],
    bearer_methods_supported: ['header'],
    scopes_supported: ['mcp']
  };
}

function oauthAuthorizationServerMetadata(baseUrl) {
  return {
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/oauth/authorize`,
    token_endpoint: `${baseUrl}/oauth/token`,
    registration_endpoint: `${baseUrl}/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token', 'client_credentials'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic', 'none'],
    scopes_supported: ['mcp']
  };
}

function oauthUnauthorizedHeaders(baseUrl) {
  return {
    'www-authenticate': `Bearer realm="${SERVER_NAME}", resource_metadata="${baseUrl}/.well-known/oauth-protected-resource"`,
    'cache-control': 'no-store'
  };
}

function oauthError(res, statusCode, error, description, extraHeaders = {}) {
  json(
    res,
    statusCode,
    {
      error,
      error_description: description
    },
    extraHeaders
  );
}

function cleanupOauthState() {
  const now = nowMs();
  for (const [code, value] of OAUTH_CODES.entries()) {
    if (value.expires_at_ms <= now) {
      OAUTH_CODES.delete(code);
    }
  }
  for (const [token, value] of OAUTH_TOKENS.entries()) {
    if (value.expires_at_ms <= now) {
      OAUTH_TOKENS.delete(token);
    }
  }
  for (const [refreshToken, value] of OAUTH_REFRESH_TOKENS.entries()) {
    if (value.expires_at_ms <= now) {
      OAUTH_REFRESH_TOKENS.delete(refreshToken);
    }
  }
}

function decodeBasicAuth(authorizationHeader) {
  if (!authorizationHeader || !authorizationHeader.startsWith('Basic ')) {
    return { client_id: '', client_secret: '' };
  }
  const encoded = authorizationHeader.slice('Basic '.length).trim();
  try {
    const decoded = Buffer.from(encoded, 'base64').toString('utf8');
    const idx = decoded.indexOf(':');
    if (idx < 0) {
      return { client_id: decoded, client_secret: '' };
    }
    return {
      client_id: decoded.slice(0, idx),
      client_secret: decoded.slice(idx + 1)
    };
  } catch {
    return { client_id: '', client_secret: '' };
  }
}

function authenticateOauthClient(req, body) {
  const basic = decodeBasicAuth(String(req.headers.authorization || ''));
  const clientId = String(basic.client_id || body.client_id || '').trim();
  const clientSecret = String(basic.client_secret || body.client_secret || '').trim();
  const grantType = String(body.grant_type || '').trim();
  const authCode = String(body.code || '').trim();
  const canSeedWithoutSecret =
    grantType === 'authorization_code' && authCode.length > 0;

  if (!clientId) {
    return { ok: false, error: 'invalid_client', description: 'client_id is required' };
  }
  let client = OAUTH_CLIENTS.get(clientId);
  if (!client) {
    if (OAUTH_ALLOW_UNKNOWN_CLIENT_SEED && (clientSecret || canSeedWithoutSecret)) {
      client = upsertOauthClient({
        client_id: clientId,
        client_secret: clientSecret || null,
        redirect_uris: [],
        scope: 'mcp',
        token_endpoint_auth_method: clientSecret ? 'client_secret_post' : 'none',
        created_at: Math.floor(nowMs() / 1000),
        seeded: true
      });
      console.warn(`[oauth] seeded unknown client_id from token request: ${clientId}`);
    } else {
      return { ok: false, error: 'invalid_client', description: 'unknown client_id' };
    }
  }

  const requiresSecret = client.token_endpoint_auth_method !== 'none';
  if (requiresSecret) {
    if (!clientSecret) {
      return { ok: false, error: 'invalid_client', description: 'client_secret is required' };
    }
    if (client.client_secret !== clientSecret) {
      return { ok: false, error: 'invalid_client', description: 'client_secret mismatch' };
    }
  }

  return { ok: true, client };
}

function issueRefreshToken(clientId, scope = 'mcp') {
  const refreshToken = randomId('coco_rt');
  const expiresAtMs = nowMs() + OAUTH_REFRESH_TOKEN_TTL_SECONDS * 1000;
  OAUTH_REFRESH_TOKENS.set(refreshToken, {
    refresh_token: refreshToken,
    client_id: clientId,
    scope,
    expires_at_ms: expiresAtMs
  });
  return refreshToken;
}

function issueAccessToken(clientId, scope = 'mcp', { includeRefreshToken = false } = {}) {
  const token = randomId('coco_at');
  const expiresAtMs = nowMs() + OAUTH_TOKEN_TTL_SECONDS * 1000;
  OAUTH_TOKENS.set(token, {
    token,
    client_id: clientId,
    scope,
    expires_at_ms: expiresAtMs
  });
  const response = {
    access_token: token,
    token_type: 'Bearer',
    expires_in: OAUTH_TOKEN_TTL_SECONDS,
    scope
  };
  if (includeRefreshToken) {
    response.refresh_token = issueRefreshToken(clientId, scope);
  }
  return response;
}

function getBearerToken(req) {
  const authorization = String(req.headers.authorization || '').trim();
  if (!authorization.startsWith('Bearer ')) {
    return '';
  }
  return authorization.slice('Bearer '.length).trim();
}

function isBearerTokenValid(token) {
  if (!token) return false;
  const stored = OAUTH_TOKENS.get(token);
  if (!stored) return false;
  if (stored.expires_at_ms <= nowMs()) {
    OAUTH_TOKENS.delete(token);
    return false;
  }
  return true;
}

async function handleOauthRegister(req, res) {
  let body;
  try {
    body = await readRequestBody(req);
  } catch {
    oauthError(res, 400, 'invalid_request', 'invalid JSON body');
    return;
  }

  const redirectUris = Array.isArray(body.redirect_uris)
    ? body.redirect_uris.map((v) => String(v).trim()).filter(Boolean)
    : [];
  if (redirectUris.length === 0) {
    oauthError(res, 400, 'invalid_client_metadata', 'redirect_uris is required');
    return;
  }

  const tokenEndpointAuthMethod = String(body.token_endpoint_auth_method || 'client_secret_post').trim();
  const clientId = randomId('coco_client');
  const needsSecret = tokenEndpointAuthMethod !== 'none';
  const clientSecret = needsSecret ? randomId('coco_secret') : null;
  const scope = String(body.scope || 'mcp').trim() || 'mcp';

  const client = {
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uris: redirectUris,
    scope,
    token_endpoint_auth_method: tokenEndpointAuthMethod,
    created_at: Math.floor(nowMs() / 1000),
    dynamic: true
  };
  upsertOauthClient(client);

  const response = {
    client_id: client.client_id,
    client_id_issued_at: client.created_at,
    redirect_uris: client.redirect_uris,
    token_endpoint_auth_method: client.token_endpoint_auth_method,
    grant_types: ['authorization_code', 'refresh_token', 'client_credentials'],
    response_types: ['code']
  };
  if (client.client_secret) {
    response.client_secret = client.client_secret;
    response.client_secret_expires_at = 0;
  }

  json(res, 201, response, { 'cache-control': 'no-store' });
}

function resolveRedirectUriForAuthorize(client, requestedRedirectUri) {
  const redirectUri = String(requestedRedirectUri || '').trim();
  if (redirectUri) {
    if (client.redirect_uris.length > 0 && !client.redirect_uris.includes(redirectUri)) {
      return { ok: false, error: 'invalid_request', description: 'redirect_uri is not registered' };
    }
    return { ok: true, redirect_uri: redirectUri };
  }

  if (client.redirect_uris.length === 1) {
    return { ok: true, redirect_uri: client.redirect_uris[0] };
  }
  return { ok: false, error: 'invalid_request', description: 'redirect_uri is required' };
}

function handleOauthAuthorize(req, res, url) {
  const responseType = String(url.searchParams.get('response_type') || '').trim();
  const clientId = String(url.searchParams.get('client_id') || '').trim();
  const state = String(url.searchParams.get('state') || '');
  const codeChallenge = String(url.searchParams.get('code_challenge') || '').trim();
  const codeChallengeMethod = String(url.searchParams.get('code_challenge_method') || 'S256').trim();
  const scope = String(url.searchParams.get('scope') || 'mcp').trim() || 'mcp';

  if (responseType !== 'code') {
    oauthError(res, 400, 'unsupported_response_type', 'response_type must be code');
    return;
  }
  if (!clientId) {
    oauthError(res, 400, 'invalid_request', 'client_id is required');
    return;
  }
  const client = OAUTH_CLIENTS.get(clientId);
  if (!client) {
    oauthError(res, 400, 'invalid_client', 'unknown client_id');
    return;
  }

  const redirectResolution = resolveRedirectUriForAuthorize(
    client,
    url.searchParams.get('redirect_uri')
  );
  if (!redirectResolution.ok) {
    oauthError(res, 400, redirectResolution.error, redirectResolution.description);
    return;
  }

  const redirectUri = redirectResolution.redirect_uri;
  const code = randomId('coco_code');
  OAUTH_CODES.set(code, {
    code,
    client_id: client.client_id,
    redirect_uri: redirectUri,
    code_challenge: codeChallenge || null,
    code_challenge_method: codeChallenge ? codeChallengeMethod : null,
    scope,
    expires_at_ms: nowMs() + OAUTH_CODE_TTL_SECONDS * 1000
  });

  let location;
  try {
    const redirectUrl = new URL(redirectUri);
    redirectUrl.searchParams.set('code', code);
    if (state) {
      redirectUrl.searchParams.set('state', state);
    }
    location = redirectUrl.toString();
  } catch {
    oauthError(res, 400, 'invalid_request', 'redirect_uri must be a valid URL');
    return;
  }

  res.writeHead(302, {
    location,
    'cache-control': 'no-store'
  });
  res.end();
}

function verifyCodeChallenge(codeRecord, codeVerifier) {
  if (!codeRecord.code_challenge) {
    return true;
  }
  if (!codeVerifier) {
    return false;
  }
  const method = String(codeRecord.code_challenge_method || 'S256').toUpperCase();
  if (method === 'S256') {
    return sha256Base64Url(codeVerifier) === codeRecord.code_challenge;
  }
  if (method === 'PLAIN') {
    return codeVerifier === codeRecord.code_challenge;
  }
  return false;
}

async function handleOauthToken(req, res) {
  let body;
  try {
    body = await readRequestBody(req);
  } catch {
    oauthError(res, 400, 'invalid_request', 'invalid token request payload');
    return;
  }

  const grantType = String(body.grant_type || '').trim();
  if (!grantType) {
    oauthError(res, 400, 'invalid_request', 'grant_type is required');
    return;
  }

  const auth = authenticateOauthClient(req, body);
  if (!auth.ok) {
    oauthError(res, 401, auth.error, auth.description, { 'cache-control': 'no-store' });
    return;
  }

  if (grantType === 'client_credentials') {
    const scope = String(body.scope || auth.client.scope || 'mcp').trim() || 'mcp';
    const tokenResponse = issueAccessToken(auth.client.client_id, scope);
    json(res, 200, tokenResponse, { 'cache-control': 'no-store' });
    return;
  }

  if (grantType === 'authorization_code') {
    const code = String(body.code || '').trim();
    if (!code) {
      oauthError(res, 400, 'invalid_request', 'code is required');
      return;
    }
    const codeRecord = OAUTH_CODES.get(code);
    if (!codeRecord) {
      oauthError(res, 400, 'invalid_grant', 'unknown code');
      return;
    }
    if (codeRecord.expires_at_ms <= nowMs()) {
      OAUTH_CODES.delete(code);
      oauthError(res, 400, 'invalid_grant', 'code expired');
      return;
    }
    if (codeRecord.client_id !== auth.client.client_id) {
      oauthError(res, 400, 'invalid_grant', 'code client mismatch');
      return;
    }

    const redirectUri = String(body.redirect_uri || '').trim();
    if (redirectUri && redirectUri !== codeRecord.redirect_uri) {
      oauthError(res, 400, 'invalid_grant', 'redirect_uri mismatch');
      return;
    }

    const codeVerifier = String(body.code_verifier || '').trim();
    if (!verifyCodeChallenge(codeRecord, codeVerifier)) {
      oauthError(res, 400, 'invalid_grant', 'invalid code_verifier');
      return;
    }

    OAUTH_CODES.delete(code);
    const tokenResponse = issueAccessToken(auth.client.client_id, codeRecord.scope || 'mcp', {
      includeRefreshToken: true
    });
    json(res, 200, tokenResponse, { 'cache-control': 'no-store' });
    return;
  }

  if (grantType === 'refresh_token') {
    const refreshToken = String(body.refresh_token || '').trim();
    if (!refreshToken) {
      oauthError(res, 400, 'invalid_request', 'refresh_token is required');
      return;
    }
    const refreshRecord = OAUTH_REFRESH_TOKENS.get(refreshToken);
    if (!refreshRecord) {
      oauthError(res, 400, 'invalid_grant', 'unknown refresh_token');
      return;
    }
    if (refreshRecord.expires_at_ms <= nowMs()) {
      OAUTH_REFRESH_TOKENS.delete(refreshToken);
      oauthError(res, 400, 'invalid_grant', 'refresh_token expired');
      return;
    }
    if (refreshRecord.client_id !== auth.client.client_id) {
      oauthError(res, 400, 'invalid_grant', 'refresh_token client mismatch');
      return;
    }

    OAUTH_REFRESH_TOKENS.delete(refreshToken);
    const scope = String(refreshRecord.scope || auth.client.scope || 'mcp').trim() || 'mcp';
    const tokenResponse = issueAccessToken(auth.client.client_id, scope, {
      includeRefreshToken: true
    });
    json(res, 200, tokenResponse, { 'cache-control': 'no-store' });
    return;
  }

  oauthError(res, 400, 'unsupported_grant_type', `unsupported grant_type: ${grantType}`);
}

function logRequest(req, url) {
  const host = extractRequestHost(req);
  const ua = String(req.headers['user-agent'] || '').slice(0, 120);
  const hasAuthorization = req.headers.authorization ? 'yes' : 'no';
  const hasCfServiceTokenId = req.headers['cf-access-client-id'] ? 'yes' : 'no';
  const requireBearer = shouldRequireBearer(req) ? 'yes' : 'no';
  console.log(
    `[http] ${req.method} ${url.pathname} host=${host || '-'} auth=${hasAuthorization} bearer_required=${requireBearer} cf_service_token=${hasCfServiceTokenId} ua="${ua}"`
  );
}

const server = http.createServer(async (req, res) => {
  cleanupOauthState();
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const baseUrl = inferBaseUrl(req);
  logRequest(req, url);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'POST,GET,OPTIONS',
      'access-control-allow-headers': 'content-type,mcp-session-id,authorization'
    });
    res.end();
    return;
  }

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
    json(res, 200, {
      ok: true,
      profile: MCP_PROFILE,
      name: SERVER_NAME,
      transport: 'streamable-http',
      endpoint: '/mcp',
      oauth_enabled: OAUTH_ENABLED,
      bearer_required: REQUIRE_BEARER,
      bypass_bearer_for_private: BYPASS_BEARER_FOR_PRIVATE,
      public_hosts: PUBLIC_HOST_SUFFIXES,
      semantic_search_enabled: true,
      embedding_provider: 'jina',
      embedding_model: JINA_EMBEDDING_MODEL,
      embedding_enabled: Boolean(JINA_API_KEY),
      supabase_auth_mode: SUPABASE_AUTH_MODE,
      supabase_capabilities: buildSupabaseCapabilityPayload(),
      source_mode: SOURCE_MODE,
      memory_sources: MEMORY_SOURCE_LIST.slice(),
      extra_sources: EXTRA_SOURCE_LIST.slice(),
      source_registry_cache: buildSourceRegistryHealthPayload()
    });
    return;
  }

  if (OAUTH_ENABLED && req.method === 'GET' && url.pathname === '/.well-known/oauth-protected-resource') {
    json(res, 200, oauthProtectedResourceMetadata(baseUrl), { 'cache-control': 'no-store' });
    return;
  }

  if (OAUTH_ENABLED && req.method === 'GET' && url.pathname === '/.well-known/oauth-authorization-server') {
    json(res, 200, oauthAuthorizationServerMetadata(baseUrl), { 'cache-control': 'no-store' });
    return;
  }

  if (OAUTH_ENABLED && req.method === 'POST' && (url.pathname === '/oauth/register' || url.pathname === '/register')) {
    await handleOauthRegister(req, res);
    return;
  }

  if (OAUTH_ENABLED && req.method === 'GET' && (url.pathname === '/oauth/authorize' || url.pathname === '/authorize')) {
    handleOauthAuthorize(req, res, url);
    return;
  }

  if (OAUTH_ENABLED && req.method === 'POST' && (url.pathname === '/oauth/token' || url.pathname === '/token')) {
    await handleOauthToken(req, res);
    return;
  }

  // Streamable HTTP: this server is POST-only (no SSE streaming of
  // server-initiated notifications). Per MCP spec, respond to GET /mcp with
  // 405 Method Not Allowed + an `allow` header so compliant clients (Cursor,
  // Claude Desktop, etc.) fall back to POST-only request/response instead
  // of treating the missing stream as a fatal transport error (404 would
  // cause Cursor's V2 FSM to tombstone the transport after 5 retries).
  if (
    req.method === 'GET' &&
    ['/mcp', '/mcp/', '/'].includes(url.pathname)
  ) {
    res.writeHead(405, {
      'access-control-allow-origin': '*',
      allow: 'POST',
      'cache-control': 'no-store'
    });
    res.end();
    return;
  }

  if (req.method !== 'POST' || !['/mcp', '/mcp/', '/'].includes(url.pathname)) {
    json(res, 404, { error: 'not_found' });
    return;
  }

  if (shouldRequireBearer(req)) {
    const bearerToken = getBearerToken(req);
    if (!isBearerTokenValid(bearerToken)) {
      json(res, 401, { error: 'unauthorized' }, oauthUnauthorizedHeaders(baseUrl));
      return;
    }
  }

  let rpc;
  try {
    rpc = await readRequestBody(req);
  } catch {
    json(res, 400, mcpError(null, -32700, 'Parse error'));
    return;
  }

  const id = rpc?.id ?? null;
  const method = rpc?.method;

  try {
    if (method === 'initialize') {
      json(
        res,
        200,
        mcpResult(id, {
          protocolVersion: '2025-03-26',
          capabilities: { tools: { listChanged: false } },
          serverInfo: {
            name: SERVER_NAME,
            version: '0.3.1'
          }
        })
      );
      return;
    }

    if (method === 'notifications/initialized') {
      res.writeHead(202);
      res.end();
      return;
    }

    if (method === 'tools/list') {
      json(
        res,
        200,
        mcpResult(id, { tools: listAvailableToolsForAuthMode(SUPABASE_AUTH_MODE) })
      );
      return;
    }

    if (method === 'tools/call') {
      const requestedToolName = rpc?.params?.name;
      const toolName = resolveToolName(requestedToolName);
      assertToolCapabilityForAuthMode(toolName);
      const dbAuthMode = resolveDbAuthModeForTool(toolName);
      const args = rpc?.params?.arguments ?? {};
      const result = await SUPABASE_REQUEST_CONTEXT.run(
        { db_auth_mode: dbAuthMode },
        async () => await callTool(toolName, args)
      );
      json(
        res,
        200,
        mcpResult(id, {
          content: [{ type: 'text', text: JSON.stringify(result) }]
        })
      );
      return;
    }

    if (method === 'ping') {
      json(res, 200, mcpResult(id, {}));
      return;
    }

    json(res, 404, mcpError(id, -32601, 'Method not found'));
  } catch (error) {
    json(
      res,
      200,
      mcpResult(id, {
        content: [{ type: 'text', text: JSON.stringify({ ok: false, error: String(error.message || error) }) }],
        isError: true
      })
    );
  }
});

server.on('error', (error) => {
  if (error?.code === 'EADDRINUSE') {
    const hint =
      PORT_SOURCE === 'env'
        ? `Set PORT to an unused value (current PORT=${PORT}).`
        : `Set PORT to an unused value or use another MCP_PROFILE (profile=${MCP_PROFILE}, default_port=${PROFILE.defaultPort}).`;
    console.error(`[fatal] ${SERVER_NAME} cannot start: port ${PORT} is already in use. ${hint}`);
    process.exit(1);
    return;
  }
  console.error(
    `[fatal] ${SERVER_NAME} failed to start: ${String(error?.message || error)}`
  );
  process.exit(1);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`${SERVER_NAME} listening on 0.0.0.0:${PORT}`);
  console.log(
    `[config] profile=${MCP_PROFILE} resolved_port=${PORT} source=${PORT_SOURCE} profile_default_port=${PROFILE.defaultPort}`
  );
  console.log(`[config] source_mode=${SOURCE_MODE}`);
  if (SOURCE_MODE === 'registry') {
    void reloadSourceRegistryCache()
      .then((result) => {
        if (result?.ok) {
          console.log(
            `[source_registry] loaded ${result.enabled_sources.length} enabled sources`
          );
        } else {
          console.warn(
            `[source_registry] initial load failed: ${String(result?.error || 'unknown error')}`
          );
        }
      })
      .catch((error) => {
        console.warn(
          `[source_registry] initial load failed: ${String(error?.message || error)}`
        );
      });
  }
  if (OAUTH_ENABLED) {
    console.log('oauth endpoints enabled: /.well-known/*, /oauth/register, /oauth/authorize, /oauth/token');
  }
});
