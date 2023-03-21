/**
 * このWebWorkerでは、読み込まれた動画データを OPFS 上にキャッシュします。
 * これにより、プロジェクトを読み込んだときにJavaScriptから動画データが読み込めるようになります。
 */
self.addEventListener("message", async (message) => {
  console.log(message.data);
  if (!message.data) return;

  const data: Record<string, unknown> = message.data;

  if (!isSaveStartMessageData(data)) return;

  const root = await navigator.storage.getDirectory();
  const draftHandler = await root.getFileHandle(data.fileName, {
    create: true,
  });
  const writeBuffer = await draftHandler.createWritable();

  const writer = writeBuffer.getWriter();
  const reader = data.stream.getReader();

  const array: Uint8Array[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      await writer.close();
      break;
    }

    await writer.write(value);

    array.push(value);
  }

  const totalLength = array.reduce((prev, current) => prev + current.length, 0);

  const merged = new Uint8Array(totalLength);
  let offset = 0;

  for (const element of array) {
    merged.set(element, offset);
    offset += element.byteLength;
  }

  self.postMessage(merged);
});

type SaveStartMessageData = {
  type: "save-start";
  fileName: string;
  stream: ReadableStream<Uint8Array>;
};

const isSaveStartMessageData = (
  data: Record<string, unknown>,
): data is SaveStartMessageData => data?.type === "save-start";
