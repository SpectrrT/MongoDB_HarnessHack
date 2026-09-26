// Atlas adapter with the same surface as createMemoryDb(). Verified on the event sandbox Sep 26.
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
    // Search runs in Atlas ($rankFusion over the vector + Atlas Search indexes) unless REM_ATLAS_SEARCH=0.
    // Verified on the event sandbox (8.0.32). REM_VECTOR_MODE=explicit queries stored vectors instead
    // of autoEmbed, for clusters where autoEmbed is unavailable.
    atlasSearch: process.env.REM_ATLAS_SEARCH !== "0",
    vectorMode: process.env.REM_VECTOR_MODE === "explicit" ? "explicit" : "auto",
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
    // A fresh instance without dropDatabase: sandbox users hold readWrite (dropDatabase is unauthorized),
    // and keeping the collections keeps the Atlas Search indexes READY instead of rebuilding them.
    async dropDatabase() {
      for (const c of await db.listCollections({}, { nameOnly: true }).toArray())
        if (!c.name.startsWith("system.")) await db.collection(c.name).deleteMany({});
    },
    close: () => client.close(),
  };
}
