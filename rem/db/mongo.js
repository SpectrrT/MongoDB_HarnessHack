// TOMORROW: Atlas adapter with the same surface as createMemoryDb(). Not exercised tonight.
// Needs `npm install mongodb` and MONGODB_URI pointing at the Atlas Sandbox cluster.
export async function createMongoDb({ uri = process.env.MONGODB_URI, dbName = "rem" } = {}) {
  if (!uri) throw new Error("Set MONGODB_URI to the Atlas Sandbox connection string.");
  const { MongoClient, ObjectId } = await import("mongodb");
  const client = new MongoClient(uri, { appName: "rem-engine" });
  await client.connect();
  const db = client.db(dbName);
  return {
    kind: "mongo",
    databaseName: dbName,
    client,
    toId: (id) => (ObjectId.isValid(String(id)) ? new ObjectId(String(id)) : id),
    // 1 = hybrid search through $rankFusion on the autoEmbed + Atlas Search indexes (needs 8.1+).
    atlasSearch: process.env.REM_ATLAS_SEARCH === "1",
    collection: (name) => db.collection(name),
    listCollections: (filter, options) => db.listCollections(filter, options),
    watch: (pipeline, options) => db.watch(pipeline, options),
    async createCollection(name, options = {}) {
      try {
        return await db.createCollection(name, options);
      } catch (error) {
        if (error.codeName !== "NamespaceExists") throw error;
        return db.collection(name);
      }
    },
    async withTransaction(fn) {
      const session = client.startSession();
      try {
        let result;
        await session.withTransaction(async () => {
          result = await fn(session);
        });
        return result;
      } finally {
        await session.endSession();
      }
    },
    // Atlas's TTL monitor deletes expired episodes about once a minute; nothing to do here.
    sweepExpired: async () => 0,
    dropDatabase: () => db.dropDatabase(),
    close: () => client.close(),
  };
}
