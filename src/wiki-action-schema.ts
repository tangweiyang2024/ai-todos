import { z } from 'zod';
import { wikiModelSelectionSchema } from './wiki-models.ts';
import { sessionConfirmSchema } from './domain.ts';

const id = z.string().uuid();
const revision = z.number().int().positive();
const list = z.object({ operation: z.literal('list'), sessionId: id }).strict();
const openCapture = z.object({ operation: z.literal('open_capture'), sessionId: id }).strict();
const prepareCapture = z.object({ operation: z.literal('prepare_capture'), sessionId: id }).strict();
const ackCapture = z.object({ operation: z.literal('ack_capture'), sessionId: id, jobId: id }).strict();
const archiveSession = z.object({ operation: z.literal('archive_session'), confirmation: sessionConfirmSchema.extend({ archive: z.literal(true) }) }).strict();
const models = z.object({ operation: z.literal('models') }).strict();
const captureModel = z.object({ operation: z.literal('set_capture_model'), revision: z.number().int().nonnegative(), modelSelection: wikiModelSelectionSchema }).strict();
const generate = z.object({ operation: z.literal('generate'), sessionId: id, modelSelection: wikiModelSelectionSchema.optional() }).strict();
const start = z.object({ operation: z.literal('start'), sessionId: id, modelSelection: wikiModelSelectionSchema.optional() }).strict();
const progress = z.object({ operation: z.literal('progress'), sessionId: id }).strict();
const cancel = z.object({ operation: z.literal('cancel'), sessionId: id }).strict();
const update = z.object({ operation: z.literal('update'), id, revision, data: z.unknown() }).strict();
const reject = z.object({ operation: z.literal('reject'), id, revision, note: z.string().max(20000) }).strict();
const preview = z.object({ operation: z.literal('preview'), id, revision }).strict();
const compare = z.object({ operation: z.literal('compare'), id, revision, modelSelection: wikiModelSelectionSchema.optional() }).strict();
const approve = z.object({ operation: z.literal('approve'), ticket: z.string().regex(/^[a-f0-9]{48}$/) }).strict();
const openReview = z.object({ operation: z.literal('open_review'), id, revision }).strict();

/** 本地浏览器可预览和批准；批准只接受服务端签发的票据。 */
export const wikiActionSchema = z.discriminatedUnion('operation', [list, openCapture, prepareCapture, ackCapture, archiveSession, models, captureModel, generate, start, progress, cancel, update, reject, compare, preview, approve]);
/** 嵌入式应用可检查候选和打开本地审核页，但不暴露批准写入操作。 */
export const wikiUiSchema = z.object({
  uiSessionId: id,
  bridgeRevision: z.literal(1).optional(),
  action: z.discriminatedUnion('operation', [list, openCapture, prepareCapture, ackCapture, archiveSession, models, captureModel, generate, start, progress, cancel, update, reject, compare, preview, openReview]),
}).strict();

/** MCP 仅校验稳定信封；具体操作与批准边界由本地服务的严格 schema 校验。 */
export const wikiBridgeSchema = z.object({
  uiSessionId: id,
  action: z.object({ operation: z.string().min(1) }).passthrough(),
}).strict();
