import { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";
import { createFFmpeg } from "@ffmpeg/ffmpeg";
import { Movie, db } from "./db";

type VideoListVideo = Movie & {
  buf: ArrayBuffer;
};

const saveMovie = new Worker(
  new URL("./worker/saveMovie.ts", import.meta.url),
  { type: "classic" }
);

const loadMovieFromOPFS = new Worker(
  new URL("./worker/loadMovieFromOPFS", import.meta.url),
  { type: "classic" }
);

function App() {
  const [isOpened, setIsOpened] = useState(false);
  const [videos, setVideos] = useState<VideoListVideo[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ffmpeg = createFFmpeg({ log: true });

  const [frame, setFrame] = useState(0);

  /**
   * プロジェクトを開く
   * OPFSから必要な動画データをメモリ上に置く
   */
  const openProjectData = async () => {
    const movies = await db.movies.toArray();
    console.log(movies);

    loadMovieFromOPFS.postMessage({
      type: "load-movie-from-opfs",
      fileNames: movies.map((movie) => movie.fileNameOPFS),
    });
    loadMovieFromOPFS.addEventListener("message", (message) => {
      const loadedVideos = movies.map((movie, i) => ({
        ...movie,
        buf: message.data[i],
      }));
      setVideos(loadedVideos);
      setIsOpened(true);
    });
  };

  /**
   * 動画をインポート
   * アプリを終了したあとも、プロジェクトを読み込めるようにするため、読み込んだ動画データはOPFSにコピーする
   */
  const loadMovie: React.ChangeEventHandler<HTMLInputElement> = useCallback(
    (e) => {
      (async () => {
        const files = e.currentTarget.files;
        if (files === null || !files.length) return;

        const videoFile = files.item(0);
        if (videoFile === null) return;

        const stream = videoFile.stream();
        const tee = stream.tee();
        /*
      読み込んだファイルをキャッシュする
      */
        const id = new Date().getTime();

        console.log(id);

        saveMovie.postMessage(
          { type: "save-start", stream: tee[0], fileName: `${id}.mp4` },
          { transfer: [tee[0]] }
        );

        /*
      teeを使ってメモリ上にも読み込む
    */

        const promise: Promise<Uint8Array> = new Promise((resolve) => {
          const controller = new AbortController();
          saveMovie.addEventListener("message", (message) => {
            resolve(message.data);
            controller.abort();
          });
        });

        const array = await promise;
        console.log(array);

        setVideos([
          ...videos,
          {
            id,
            name: videoFile.name,
            fileNameOPFS: `${id}.mp4`,
            buf: array.buffer,
          },
        ]);
      })();
    },
    []
  );

  /**
   * プロジェクト（=読み込んだ動画のOPFSにおけるファイル名のリスト）を保存できる
   */

  const saveProjectData = async () => {
    await db.movies.bulkPut(videos.map(({ buf, ...movie }) => movie));
  };

  /**
   * アプリの開始時にffmpegを読み込む
   */
  useEffect(() => {
    (async () => {
      await ffmpeg.load();
    })();
  }, []);

  /**
   * ffmpeg.wasm からフレーム画像を取得し Canvas に描画する
   */
  useEffect(() => {
    (async () => {
      if (!videos.length) return;

      const canvas = canvasRef.current;
      if (canvas === null) return;

      const ctx = canvas.getContext("2d");
      if (ctx === null) return;

      await ffmpeg.load();

      // WebAssemblyが使用可能なメモリ上にファイルを書き出す
      // FFmpeg.wasmは、メモリ上の仮想的なファイルシステムを用いることで、本家ffmpegのインターフェースをそのまま使えるようにした
      videos.forEach((video) => {
        ffmpeg.FS("writeFile", `${video.id}.mp4`, new Uint8Array(video.buf));
      });

      const options = videos.map((video) => ["-i", `${video.id}.mp4`]).flat();
      console.log(options);

      await ffmpeg.run(
        ...options,
        "-y",
        "-vf",
        `select=eq(n\\,${frame})`,
        "-frames:v",
        "1",
        "-update",
        "1",
        "output.png"
      );

      /*
      const sleep = (ms: number) => new Promise((resolve, reject) => setTimeout(() => {resolve(null)}, ms))
      await sleep(3000);
      */

      const data = ffmpeg.FS("readFile", "output.png");

      const img = new Image();
      img.src = URL.createObjectURL(new Blob([data], { type: "image/png" }));

      const waitImageLoad = new Promise((resolve) =>
        img.addEventListener("load", () => resolve(null))
      );
      await waitImageLoad;

      ctx.drawImage(img, 0, 0);
    })();
  }, [frame, videos]);

  return (
    <div className="App w-screen grid grid-cols-3">
      <div className="drawer col-start-1 col-end-1 bg-gray-800 drop-shadow-lg">
        <section className="drawer-side">
          <section className="flex justify-center p-6 text-2xl font-bold text-blue-50">
            動画表示するよー
          </section>
          {!isOpened ? (
            <section className="projectSettings flex flex-col items-center w-full">
              <button
                className="btn btn-primary w-3/5"
                onClick={() => openProjectData()}
              >
                プロジェクトを読み込む
              </button>
            </section>
          ) : (
            <div>
              <section className="projectSettings  flex flex-col items-center w-full">
                <button className="btn w-3/5" onClick={saveProjectData}>
                  プロジェクトを上書き保存
                </button>
              </section>
              <div className="divider" />
              <section className="movies flex flex-col items-center w-full gap-5">
                <ul className="menu bg-base-100 rounded-box w-3/5">
                  {videos.map((video) => (
                    <li key={video.id}>
                      <a>{video.name}</a>
                    </li>
                  ))}
                </ul>
                <input
                  type="file"
                  className="file-input"
                  onChange={loadMovie}
                />
              </section>
            </div>
          )}
        </section>
      </div>
      <section className="main col-start-2 col-end-4 p-10 bg-gray-700 flex flex-col gap-5 justify-center items-center">
        <canvas
          width={1280}
          height={720}
          className="bg-gray-50 w-3/4"
          ref={canvasRef}
        ></canvas>
        <input
          type="range"
          className="range range-primary"
          defaultValue={0}
          step={1}
          max={6700}
          onChange={(e) => setFrame(e.currentTarget.valueAsNumber)}
        />
      </section>
    </div>
  );
}

export default App;
