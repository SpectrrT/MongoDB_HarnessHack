// Preserve raw evidence before it leaves the searchable episode collection.
import { BSON } from 'mongodb';
import { createHash } from 'node:crypto';

export const ARCHIVE_PART_BYTES = 65536;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

export async function retireEpisodes(db, filter, { now, expireAt, remove = false, reason = 'consolidated' }) {
  if (!Number.isFinite(new Date(now).getTime()) || (!remove && !Number.isFinite(new Date(expireAt).getTime())))
    throw new Error('Episode retirement requires valid timestamps.');
  let retired = 0;
  for (;;) {
    const count = await db.withTransaction(async session => {
      const episodes = db.collection('episodes'), archive = db.collection('episode_archive');
      const parts = db.collection('episode_archive_parts');
      const batch = await episodes.find({ $and: [filter, { consolidated: { $ne: true } }] },
        { sort: { _id: 1 }, limit: 25, session }).toArray();
      const ids = []; let batchBytes = 0;
      for (const episode of batch) {
        const bytes = BSON.serialize(episode);
        if (ids.length && batchBytes + bytes.length > 1048576) break;
        const archiveKey = hash(BSON.serialize({ id: episode._id }));
        const digest = hash(bytes), count = Math.ceil(bytes.length / ARCHIVE_PART_BYTES);
        const existing = await archive.findOne({ _id: episode._id }, { session });
        if (existing && existing.digest !== digest) throw new Error('Raw episode changed after it was archived.');
        for (let part = 0; part < count; part++) await parts.updateOne({ _id: `${archiveKey}:${part}` }, {
          $setOnInsert: { archiveKey, part, data: bytes.subarray(part * ARCHIVE_PART_BYTES, (part + 1) * ARCHIVE_PART_BYTES).toString('base64') },
        }, { upsert: true, session });
        await archive.updateOne({ _id: episode._id }, { $setOnInsert: {
          archiveKey, digest, bytes: bytes.length, parts: count, kind: episode.kind, runId: episode.runId,
          summary: String(episode.summary || '').slice(0, 320), archivedAt: new Date(now), reason,
        } }, { upsert: true, session });
        ids.push(episode._id); batchBytes += bytes.length;
      }
      if (!ids.length) return 0;
      if (remove) await episodes.deleteMany({ _id: { $in: ids } }, { session });
      else await episodes.updateMany({ _id: { $in: ids } }, { $set: {
        consolidated: true, consolidatedAt: new Date(now), expireAt: new Date(expireAt),
      } }, { session });
      return ids.length;
    });
    retired += count;
    if (!count) return retired;
  }
}

export async function readEpisode(db, id) {
  const key = db.toId ? db.toId(id) : id;
  const archived = await db.collection('episode_archive').findOne({ _id: key });
  if (archived) {
    if (!Number.isInteger(archived.parts) || archived.parts < 1 || archived.parts > 256 || archived.bytes > 16777216)
      throw new Error('Invalid archived episode manifest.');
    const parts = await db.collection('episode_archive_parts').find({ archiveKey: archived.archiveKey }, { sort: { part: 1 }, limit: archived.parts + 1 }).toArray();
    if (parts.length !== archived.parts || parts.some((part, i) => part.part !== i)) throw new Error('Archived episode is missing a part.');
    const bytes = Buffer.concat(parts.map(part => Buffer.from(part.data, 'base64')));
    if (bytes.length !== archived.bytes || hash(bytes) !== archived.digest) throw new Error('Archived episode integrity check failed.');
    return { source: 'archive', archivedAt: archived.archivedAt, reason: archived.reason, episode: BSON.deserialize(bytes) };
  }
  const episode = await db.collection('episodes').findOne({ _id: key });
  return episode ? { source: 'active', episode } : null;
}

export async function listEpisodeArchive(db, { runId, kind, after, limit = 20 } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error('Archive page size must be between 1 and 50.');
  for (const value of [runId, kind, after]) if (value !== undefined && (typeof value !== 'string' || !value || value.length > 200))
    throw new Error('Archive filters must be bounded strings.');
  const filter = { ...(runId ? { runId } : {}), ...(kind ? { kind } : {}),
    ...(after ? { _id: { $gt: db.toId ? db.toId(after) : after } } : {}) };
  const rows = await db.collection('episode_archive').find(filter, { sort: { _id: 1 }, limit: limit + 1,
    projection: { _id: 1, archivedAt: 1, kind: 1, runId: 1, summary: 1 } }).toArray();
  const page = rows.slice(0, limit);
  return { episodes: page.map(({ _id, ...row }) => ({ id: String(_id), ...row })),
    next: rows.length > limit ? String(page.at(-1)._id) : null };
}

export async function readEpisodePage(db, id, { offset = 0, limit = 4000 } = {}) {
  if (typeof id !== 'string' || !id || id.length > 200 || !Number.isSafeInteger(offset) || offset < 0 || offset > 33554432
      || !Number.isInteger(limit) || limit < 1 || limit > 8000) throw new Error('Invalid episode page.');
  const found = await readEpisode(db, id);
  if (!found) return null;
  const text = JSON.stringify(found.episode);
  return { id, source: found.source, referenceOnly: true, offset, totalChars: text.length,
    text: text.slice(offset, offset + limit), nextOffset: offset + limit < text.length ? offset + limit : null };
}
