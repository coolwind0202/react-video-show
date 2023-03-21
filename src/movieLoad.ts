const filterWhetherString = (array: unknown[]) =>
  array.filter((element): element is string => typeof element === "string");

const worker = self as DedicatedWorkerGlobalScope;

worker.addEventListener("message", async (message) => {
  if (!Array.isArray(message.data)) return;
  const paths = filterWhetherString(message.data);
  const root = await worker.navigator.storage.getDirectory();

  const buffers = [];

  for (const path of paths) {
    const draftHandler = await root.getFileHandle(path, { create: true });
    const handler = await draftHandler.createSyncAccessHandle();
    const size = handler.getSize();

    const buf = new ArrayBuffer(size);

    handler.read(buf);

    handler.close();
    buffers.push(buf);
  }

  worker.postMessage(buffers);
});
