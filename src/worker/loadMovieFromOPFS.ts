self.addEventListener("message", async (message) => {
  if (!message.data) return;

  const data: Record<string, unknown> = message.data;
  console.log(data);

  if (!isLoadMovieFromOPFSMessageData(data)) return;

  const root = await self.navigator.storage.getDirectory();

  const buffers: ArrayBuffer[] = [];

  for (const fileName of data.fileNames) {
    const draftHandler = await root.getFileHandle(fileName);
    const file = await draftHandler.getFile();
    buffers.push(await file.arrayBuffer());
  }

  self.postMessage(buffers, { transfer: buffers });
});

type LoadMovieFromOPFSData = {
  type: "load-movie-from-opfs";
  fileNames: string[];
};

const isLoadMovieFromOPFSMessageData = (
  data: Record<string, unknown>,
): data is LoadMovieFromOPFSData => data?.type === "load-movie-from-opfs";
